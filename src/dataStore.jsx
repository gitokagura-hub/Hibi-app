import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { reconcileOnStartup, saveCloud } from './cloudSync';
import { scheduleAutoBackup } from './driveAutoBackup';
import { backupDataToDrive } from './googleDrive';
import { saveImage, saveAttachment } from './media';
import { migrateMediaToDrive } from './migrateMedia';
import { recoverLibraryFromDrive } from './recoverLibrary';
import {
  isTeamConnected, getAuthorName, ensureTeamSheetReady,
  fetchTeamNotes, addTeamNote, updateTeamNote, deleteTeamNote,
  fetchTeamTasks, addTeamTask, updateTeamTask, deleteTeamTask,
  fetchTeamEvents, addTeamEvent, updateTeamEvent, deleteTeamEvent,
  fetchTeamProjects, addTeamProject, deleteTeamProject, updateTeamProjectDrive,
  fetchTeamProjectItems, addTeamProjectItem, updateTeamProjectItem, deleteTeamProjectItem,
  fetchTeamMemos, saveTeamMemo,
} from './googleSheets';

const STORAGE_KEY = 'dayliybrains-data';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 写真を保存し、保存先を指す文字列を返す。
//
// 以前はここで base64 の data URL を作り、それをアプリのデータ本体にそのまま
// 埋め込んでいた。しかし Cloudflare D1 には1行あたり2MBの上限があるため、写真が
// 増えるといずれ必ずクラウド保存が失敗する作りだった(2026-08-15に実際に発生)。
// 現在は media.js を通して実体を Google Drive に置き、ここでは "drive:ID" という
// 短い参照文字列だけを返す。戻り値が文字列である点は以前と同じなので、呼び出し側の
// 変更は不要。表示側は <MediaImg> が drive参照と旧base64の両方を扱う。
export function fileToCompressedDataUrl(file) {
  return saveImage(file);
}

// 画像以外の添付ファイル。戻り値の形 { name, type, dataUrl } は以前のままで、
// dataUrl の中身が "drive:ID" になる(Drive未連携時のみ従来通り base64)。
export function fileToDataUrl(file) {
  return saveAttachment(file);
}

function emptyData() {
  return {
    tasks: [],     // { id, date, title, completed, createdAt }
    events: [],    // { id, date, time, title, endTime, color, priority, createdAt }
    memos: {},     // { [date]: { text, images: [], files: [] } }
    pinnedTasks: [], // { id, title, createdAt } — 日付に紐づかない常設のタスク。
                     // カレンダーの下に常に表示され、月を移動しても変わらない。
                     // 完了チェックは持たず、終わったら削除する運用。
    notes: [],     // { id, text, images: [], files: [], tags: [], source: 'text'|'voice', createdAt }
    projects: [],  // { id, name, items: [{id, text, images, files, createdAt}], driveFolderId: '', driveFiles: [], createdAt }
    libraryPhotos: [], // { id, src, createdAt } — Photos画面から直接追加された写真(他の画面のメモ等には紐付かない)
    libraryFiles: [], // { id, name, type, dataUrl, folderId, createdAt } — Files画面から直接追加されたファイル。folderId=nullはルート直下
    libraryFolders: [], // { id, name, createdAt } — Files画面のフォルダ
    libraryTags: {}, // { [src]: string[] } — Photos画面の写真タグ(以前はlocalStorageのみで保護されていなかった)
    libraryComments: {}, // { [src]: string } — Photos画面の写真キャプション
    libraryCategories: [], // string[] — Photos画面のタグカテゴリー一覧
    settings: { geminiKey: '', chatgptKey: '', claudeKey: '', photoCategories: [] },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) return emptyData();
    // migrate old plain-string / partial memo shapes to { text, images, files }
    const migratedMemos = {};
    for (const [date, val] of Object.entries(parsed.memos || {})) {
      if (typeof val === 'string') migratedMemos[date] = { text: val, images: [], files: [] };
      else migratedMemos[date] = { text: val.text || '', images: val.images || [], files: val.files || [] };
    }
    const migratedProjects = (parsed.projects || []).map(p => ({ driveFolderId: '', driveFiles: [], ...p, items: (p.items || []).map(it => ({ images: [], files: [], ...it })) }));
    return { ...emptyData(), ...parsed, memos: migratedMemos, projects: migratedProjects, settings: { ...emptyData().settings, ...(parsed.settings || {}) } };
  } catch {
    return emptyData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [data, setData] = useState(() => loadData());
  const [storageError, setStorageError] = useState(false);
  // クラウド(D1)保存の失敗を可視化する。以前は .catch(() => {}) で完全に
  // 握り潰しており、データサイズ超過などで恒久的に保存が失敗していても
  // ユーザーに一切知らされず、端末のlocalStorageにしか残らない状態に
  // なっていた(データ消失の温床)。
  const [cloudError, setCloudError] = useState(null);
  const saveTimer = useRef(null);
  const initialLoad = useRef(true);

  // ---- Space switching (Personal vs Team) ----
  // "space" only controls which data the screens read/write to right now.
  // Personal data lives in `data` above (localStorage, untouched by this).
  // Team data lives in `teamData` below, synced with the shared Google Sheet.
  const [space, setSpace] = useState(() => localStorage.getItem('hibi-current-space') || 'personal');
  const [teamData, setTeamData] = useState({ notes: [], tasks: [], events: [], projects: [], projectItems: [], memos: [] });
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');

  function switchSpace(next) {
    setSpace(next);
    localStorage.setItem('hibi-current-space', next);
    if (next === 'team' && isTeamConnected()) refreshTeamData();
  }

  async function refreshTeamData() {
    if (!isTeamConnected()) return;
    setTeamLoading(true);
    setTeamError('');
    try {
      await ensureTeamSheetReady();
      const [notes, tasks, events, projects, projectItems, memos] = await Promise.all([
        fetchTeamNotes(), fetchTeamTasks(), fetchTeamEvents(), fetchTeamProjects(), fetchTeamProjectItems(), fetchTeamMemos(),
      ]);
      setTeamData({ notes, tasks, events, projects, projectItems, memos });
    } catch (err) {
      console.error('refreshTeamData failed:', err);
      setTeamError('チームデータの読み込みに失敗しました（' + (err?.message || '不明なエラー') + '）');
    } finally {
      setTeamLoading(false);
    }
  }

  useEffect(() => {
    if (space === 'team' && isTeamConnected()) refreshTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ---- クラウド同期（Phase 0: D1経由でDaily Brainsのデータを端末間共有）----
  useEffect(() => {
    let cancelled = false;
    reconcileOnStartup('brains', data, (d) => {
      if (!d) return true;
      const noTasks = !Array.isArray(d.tasks) || d.tasks.length === 0;
      const noEvents = !Array.isArray(d.events) || d.events.length === 0;
      const noMemos = !d.memos || Object.keys(d.memos).length === 0;
      return noTasks && noEvents && noMemos;
    }).then((result) => {
      if (!cancelled && JSON.stringify(result) !== JSON.stringify(data)) {
        setData(result);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ok = saveData(data);
      setStorageError(!ok);
      // データサイズを常に把握しておく。base64の写真/ファイルが増えると
      // D1の1行あたりの上限に達し、以後の保存が恒久的に失敗するため。
      const payload = JSON.stringify(data);
      const sizeMB = payload.length / 1024 / 1024;
      saveCloud('brains', data)
        .then(() => setCloudError(null))
        .catch((err) => {
          setCloudError({
            message: err?.message || 'クラウド保存に失敗しました',
            sizeMB: sizeMB.toFixed(1),
            at: Date.now(),
          });
        });
    }, 400);
    // Driveへの自動バックアップ(1分間操作が止まったら)。D1保存とは別のタイマーで、
    // 頻繁なDrive API呼び出しを避ける。Drive未連携時は何もしない。
    scheduleAutoBackup('brains', data, backupDataToDrive);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data]);

  // endTime は縦列カレンダー(時間グリッド)用の終了時刻。10分単位を想定。
  // 未指定(空文字)のタスクは、グリッド上では既定の短いブロックとして表示する。
  // eventId は所属するスケジュール(予定)のID。C画面ではタスクを予定の下に
  // ぶら下げて表示する。未指定のタスク(B欄で作ったものなど)は、どの予定にも
  // 属さない扱いで一覧の末尾にまとめて表示される。
  function addTask(date, title, reminderTime, endTime, eventId) {
    const task = { id: uid(), date, title, completed: false, reminderTime: reminderTime || '', endTime: endTime || '', eventId: eventId || null, createdAt: Date.now() };
    setData(prev => ({ ...prev, tasks: [...prev.tasks, task] }));
    return task;
  }
  function toggleTask(id) {
    setData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }));
  }
  function updateTask(id, title, reminderTime, endTime) {
    setData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, title, reminderTime: reminderTime !== undefined ? reminderTime : t.reminderTime, endTime: endTime !== undefined ? endTime : t.endTime } : t) }));
  }
  function deleteTask(id) {
    setData(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  }
  // endTime は予定の終了時刻。「8:00〜11:20の会議」のように範囲を持たせたい時に使う。
  // 未指定なら、これまで通り開始時刻だけの予定として扱う。
  // color: 予定に手動で割り当てる枠線の色(未指定なら空文字。タイトルからの
  // 自動色決定はUI側のフォールバック)。priority: 月表示で同日に予定が
  // 収まりきらない時、どれを優先して見せるかの目安(数字が大きいほど優先)。
  function addEvent(date, time, title, endTime, color, priority) {
    const event = { id: uid(), date, time, title, endTime: endTime || '', color: color || '', priority: priority || 0, createdAt: Date.now() };
    setData(prev => ({ ...prev, events: [...prev.events, event] }));
    return event;
  }
  function deleteEvent(id) {
    setData(prev => ({ ...prev, events: prev.events.filter(e => e.id !== id) }));
  }
  function updateEvent(id, time, title, endTime, color, priority) {
    setData(prev => ({
      ...prev,
      events: prev.events.map(e => e.id === id
        ? {
            ...e,
            time,
            title,
            endTime: endTime !== undefined ? endTime : e.endTime,
            color: color !== undefined ? color : e.color,
            priority: priority !== undefined ? priority : e.priority,
          }
        : e),
    }));
  }
  function getMemo(date) {
    return data.memos[date] || { text: '', images: [], files: [] };
  }
  function setMemo(date, text) {
    setData(prev => ({ ...prev, memos: { ...prev.memos, [date]: { ...(prev.memos[date] || { images: [], files: [] }), text } } }));
  }
  // メモをノートへ移動したときに使う。テキスト・写真・ファイルをまとめて空にする。
  // 日付のキー自体は残す(memos[date] を参照する箇所が undefined にならないように)。
  function clearMemo(date) {
    setData(prev => ({
      ...prev,
      memos: { ...prev.memos, [date]: { text: '', images: [], files: [] } },
    }));
  }
  function addMemoImages(date, dataUrls) {
    setData(prev => {
      const existing = prev.memos[date] || { text: '', images: [], files: [] };
      return { ...prev, memos: { ...prev.memos, [date]: { ...existing, images: [...existing.images, ...dataUrls] } } };
    });
  }
  function removeMemoImage(date, index) {
    setData(prev => {
      const existing = prev.memos[date] || { text: '', images: [], files: [] };
      return { ...prev, memos: { ...prev.memos, [date]: { ...existing, images: existing.images.filter((_, i) => i !== index) } } };
    });
  }
  function updateMemoImageCategories(date, index, categories) {
    setData(prev => {
      const existing = prev.memos[date] || { text: '', images: [], files: [] };
      const images = existing.images.map((img, i) => {
        if (i !== index) return img;
        const src = typeof img === 'object' ? img.src : img;
        return { src, categories };
      });
      return { ...prev, memos: { ...prev.memos, [date]: { ...existing, images } } };
    });
  }
  function addMemoFiles(date, files) {
    setData(prev => {
      const existing = prev.memos[date] || { text: '', images: [], files: [] };
      return { ...prev, memos: { ...prev.memos, [date]: { ...existing, files: [...existing.files, ...files] } } };
    });
  }
  function removeMemoFile(date, index) {
    setData(prev => {
      const existing = prev.memos[date] || { text: '', images: [], files: [] };
      return { ...prev, memos: { ...prev.memos, [date]: { ...existing, files: existing.files.filter((_, i) => i !== index) } } };
    });
  }
  // heading はノートの見出し。iPhoneのメモのように一覧で太字で出す。
  // 未入力なら空文字のままで、一覧側が本文の1行目を代わりに表示する。
  function addNote(text, source, images, files, heading, tags, priority) {
    const note = { id: uid(), heading: heading || '', text, source: source || 'text', images: images || [], files: files || [], tags: tags || [], priority: priority || 0, createdAt: Date.now() };
    setData(prev => ({ ...prev, notes: [...prev.notes, note] }));
    return note;
  }
  // 長押しで優先度だけを変更する用(見出しなどには触れない)
  function setNotePriority(id, priority) {
    setData(prev => ({ ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, priority } : n) }));
  }
  function deleteNote(id) {
    setData(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== id) }));
  }
  function addLibraryPhotos(srcs) {
    const photos = srcs.map(src => ({ id: uid(), src, createdAt: Date.now() }));
    setData(prev => ({ ...prev, libraryPhotos: [...(prev.libraryPhotos || []), ...photos] }));
  }
  // ===== 日付に紐づかない常設タスク =====
  function addPinnedTask(title) {
    const t = title.trim();
    if (!t) return;
    setData(prev => ({
      ...prev,
      pinnedTasks: [...(prev.pinnedTasks || []), { id: uid(), title: t, createdAt: Date.now() }],
    }));
  }
  function updatePinnedTask(id, title) {
    setData(prev => ({
      ...prev,
      pinnedTasks: (prev.pinnedTasks || []).map(t => (t.id === id ? { ...t, title } : t)),
    }));
  }
  function deletePinnedTask(id) {
    setData(prev => ({
      ...prev,
      pinnedTasks: (prev.pinnedTasks || []).filter(t => t.id !== id),
    }));
  }

  function deleteLibraryPhoto(id) {
    setData(prev => ({ ...prev, libraryPhotos: (prev.libraryPhotos || []).filter(p => p.id !== id) }));
  }

  // Photos画面に並ぶ写真は、Photosライブラリだけでなく Notes / Calendar / Projects
  // からも集められている。libraryPhotos だけを消す deleteLibraryPhoto では、
  // ノートやメモに貼られた写真が一覧から消せなかった。
  // ここでは写真の参照(src)そのものを手がかりに、すべての置き場所から取り除く。
  // 同じsrcが複数箇所から参照されていれば、そのすべてから消える。
  function deletePhotosBySrc(srcList) {
    const targets = new Set(srcList);
    if (targets.size === 0) return;
    const keep = (s) => !targets.has(s);

    setData(prev => {
      const memos = {};
      for (const [date, memo] of Object.entries(prev.memos || {})) {
        memos[date] = { ...memo, images: (memo.images || []).filter(keep) };
      }
      return {
        ...prev,
        memos,
        notes: (prev.notes || []).map(n => ({ ...n, images: (n.images || []).filter(keep) })),
        projects: (prev.projects || []).map(p => ({
          ...p,
          items: (p.items || []).map(it => ({ ...it, images: (it.images || []).filter(keep) })),
        })),
        libraryPhotos: (prev.libraryPhotos || []).filter(p => keep(p.src)),
      };
    });
  }
  function addLibraryFiles(files, folderId = null) {
    const withIds = files.map(f => ({ id: uid(), ...f, folderId, createdAt: Date.now() }));
    setData(prev => ({ ...prev, libraryFiles: [...(prev.libraryFiles || []), ...withIds] }));
  }
  function deleteLibraryFile(id) {
    setData(prev => ({ ...prev, libraryFiles: (prev.libraryFiles || []).filter(f => f.id !== id) }));
  }
  function renameLibraryFile(id, name) {
    setData(prev => ({ ...prev, libraryFiles: (prev.libraryFiles || []).map(f => f.id === id ? { ...f, name } : f) }));
  }
  function renameLibraryFolder(id, name) {
    setData(prev => ({ ...prev, libraryFolders: (prev.libraryFolders || []).map(f => f.id === id ? { ...f, name } : f) }));
  }
  function setLibraryTags(tagMap) {
    setData(prev => ({ ...prev, libraryTags: tagMap }));
  }
  function setLibraryComments(commentMap) {
    setData(prev => ({ ...prev, libraryComments: commentMap }));
  }
  function setLibraryCategories(categories) {
    setData(prev => ({ ...prev, libraryCategories: categories }));
  }
  function addLibraryFolder(name) {
    const folder = { id: uid(), name, createdAt: Date.now() };
    setData(prev => ({ ...prev, libraryFolders: [...(prev.libraryFolders || []), folder] }));
    return folder;
  }
  function deleteLibraryFolder(id) {
    setData(prev => ({
      ...prev,
      libraryFolders: (prev.libraryFolders || []).filter(f => f.id !== id),
      libraryFiles: (prev.libraryFiles || []).filter(f => f.folderId !== id),
    }));
  }
  function updateNote(id, text, images, files, heading, tags, priority) {
    setData(prev => ({
      ...prev,
      notes: prev.notes.map(n => n.id === id
        ? {
            ...n,
            text,
            heading: heading !== undefined ? heading : n.heading,
            images: images !== undefined ? images : n.images,
            files: files !== undefined ? files : n.files,
            tags: tags !== undefined ? tags : n.tags,
            priority: priority !== undefined ? priority : n.priority,
          }
        : n),
    }));
  }
  function addProject(name) {
    const project = { id: uid(), name, items: [], driveFolderId: '', driveFiles: [], createdAt: Date.now() };
    setData(prev => ({ ...prev, projects: [...prev.projects, project] }));
  }
  function setProjectDriveFolderId(projectId, folderId) {
    setData(prev => ({ ...prev, projects: prev.projects.map(p => p.id === projectId ? { ...p, driveFolderId: folderId } : p) }));
  }
  function setProjectDriveFiles(projectId, files) {
    setData(prev => ({ ...prev, projects: prev.projects.map(p => p.id === projectId ? { ...p, driveFiles: files } : p) }));
  }
  function addProjectDriveFile(projectId, file) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId ? { ...p, driveFiles: [file, ...p.driveFiles] } : p),
    }));
  }
  function removeProjectDriveFile(projectId, fileId) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId ? { ...p, driveFiles: p.driveFiles.filter(f => f.id !== fileId) } : p),
    }));
  }
  function updateProjectItem(projectId, itemId, text, heading) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: p.items.map(it => it.id === itemId ? { ...it, text, heading: heading !== undefined ? heading : it.heading } : it) }
        : p),
    }));
  }
  // 長押しで優先度だけを変更する用
  function setProjectItemPriority(projectId, itemId, priority) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: p.items.map(it => it.id === itemId ? { ...it, priority } : it) }
        : p),
    }));
  }
  function deleteProject(id) {
    setData(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== id) }));
  }
  function deleteProjectItem(projectId, itemId) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: p.items.filter(it => it.id !== itemId) }
        : p),
    }));
  }
  function sendToProject(projectId, text, images, files, heading) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text, heading: heading || '', images: images || [], files: files || [], priority: 0, createdAt: Date.now() }] }
        : p),
    }));
  }
  function addProjectItem(projectId, text, heading) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text, heading: heading || '', images: [], files: [], priority: 0, createdAt: Date.now() }] }
        : p),
    }));
  }
  function pasteNoteToCalendar(note, date) {
    addTask(date, note.text);
    if (note.images && note.images.length > 0) addMemoImages(date, note.images);
    if (note.files && note.files.length > 0) addMemoFiles(date, note.files);
    deleteNote(note.id);
  }
  function pasteNoteToProject(note, projectId) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text: note.text, heading: note.heading || '', images: note.images || [], files: note.files || [], priority: 0, createdAt: Date.now() }] }
        : p),
    }));
    deleteNote(note.id);
  }
  function setSettings(patch) {
    setData(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }
  function addPhotoCategory(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setData(prev => {
      const existing = prev.settings.photoCategories || [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, settings: { ...prev.settings, photoCategories: [...existing, trimmed] } };
    });
  }
  function removePhotoCategory(name) {
    setData(prev => ({ ...prev, settings: { ...prev.settings, photoCategories: (prev.settings.photoCategories || []).filter(c => c !== name) } }));
  }
  // ---- Team space actions (mirror the personal ones above, but go through Sheets) ----
  async function addTeamNoteAction(text) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await addTeamNote(uid(), text, author); await refreshTeamData(); }
    catch (err) { setTeamError('保存に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function updateTeamNoteAction(id, text) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await updateTeamNote(id, text, author); await refreshTeamData(); }
    catch (err) { setTeamError('更新に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function deleteTeamNoteAction(id) {
    setTeamLoading(true);
    setTeamError('');
    try { await deleteTeamNote(id); await refreshTeamData(); }
    catch (err) { setTeamError('削除に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function addTeamTaskAction(date, title) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await addTeamTask(uid(), title, author, date); await refreshTeamData(); }
    catch (err) { setTeamError('保存に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function toggleTeamTaskAction(task) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await updateTeamTask(task.id, task.text, author, { date: task.date, completed: !task.completed }); await refreshTeamData(); }
    catch (err) { setTeamError('更新に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function updateTeamTaskAction(task, newTitle) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await updateTeamTask(task.id, newTitle, author, { date: task.date, completed: task.completed }); await refreshTeamData(); }
    catch (err) { setTeamError('更新に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function deleteTeamTaskAction(id) {
    setTeamLoading(true);
    setTeamError('');
    try { await deleteTeamTask(id); await refreshTeamData(); }
    catch (err) { setTeamError('削除に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function addTeamEventAction(date, time, title) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await addTeamEvent(uid(), title, author, date, time); await refreshTeamData(); }
    catch (err) { setTeamError('保存に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function deleteTeamEventAction(id) {
    setTeamLoading(true);
    setTeamError('');
    try { await deleteTeamEvent(id); await refreshTeamData(); }
    catch (err) { setTeamError('削除に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function updateTeamEventAction(event, time, title) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await updateTeamEvent(event.id, title, author, event.date, time); await refreshTeamData(); }
    catch (err) { setTeamError('更新に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function addTeamProjectAction(name) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await addTeamProject(uid(), name, author); await refreshTeamData(); }
    catch (err) { setTeamError('保存に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function deleteTeamProjectAction(id) {
    setTeamLoading(true);
    setTeamError('');
    try {
      await deleteTeamProject(id);
      const items = teamData.projectItems.filter(it => it.projectId === id);
      await Promise.all(items.map(it => deleteTeamProjectItem(it.id)));
      await refreshTeamData();
    }
    catch (err) { setTeamError('削除に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  // Saves a Team project's Drive folder id / file list without a full
  // refresh-triggering reload — local optimistic update so the gallery
  // doesn't flicker empty while the next refresh comes in.
  async function updateTeamProjectDriveAction(project, driveFolderId, driveFiles) {
    try {
      await updateTeamProjectDrive(project, driveFolderId, driveFiles);
      setTeamData(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === project.id ? { ...p, driveFolderId, driveFiles } : p),
      }));
    } catch (err) {
      setTeamError('Drive情報の保存に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }
  async function addTeamProjectItemAction(projectId, text) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await addTeamProjectItem(uid(), text, author, projectId); await refreshTeamData(); }
    catch (err) { setTeamError('保存に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function updateTeamProjectItemAction(id, text, projectId) {
    const author = getAuthorName() || '名無し';
    setTeamLoading(true);
    setTeamError('');
    try { await updateTeamProjectItem(id, text, author, projectId); await refreshTeamData(); }
    catch (err) { setTeamError('更新に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }
  async function deleteTeamProjectItemAction(id) {
    setTeamLoading(true);
    setTeamError('');
    try { await deleteTeamProjectItem(id); await refreshTeamData(); }
    catch (err) { setTeamError('削除に失敗しました（' + (err?.message || '不明なエラー') + '）'); }
    finally { setTeamLoading(false); }
  }

  // ---- Team Memos: one memo per calendar date, mirroring getMemo/setMemo ----
  function getTeamMemo(date) {
    const found = teamData.memos.find(m => m.id === date);
    return found || { text: '', images: [], files: [], author: '' };
  }
  async function setTeamMemoAction(date, text) {
    const author = getAuthorName() || '名無し';
    const existing = getTeamMemo(date);
    try {
      await saveTeamMemo(date, text, author, existing.images, existing.files);
      setTeamData(prev => ({
        ...prev,
        memos: prev.memos.some(m => m.id === date)
          ? prev.memos.map(m => m.id === date ? { ...m, text, author } : m)
          : [...prev.memos, { id: date, text, author, images: existing.images, files: existing.files, createdAt: Date.now() }],
      }));
    } catch (err) {
      setTeamError('メモの保存に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }
  async function addTeamMemoImagesAction(date, dataUrls) {
    const author = getAuthorName() || '名無し';
    const existing = getTeamMemo(date);
    const images = [...existing.images, ...dataUrls];
    try {
      await saveTeamMemo(date, existing.text, author, images, existing.files);
      setTeamData(prev => ({
        ...prev,
        memos: prev.memos.some(m => m.id === date)
          ? prev.memos.map(m => m.id === date ? { ...m, images } : m)
          : [...prev.memos, { id: date, text: existing.text, author, images, files: existing.files, createdAt: Date.now() }],
      }));
    } catch (err) {
      setTeamError('画像の保存に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }
  async function removeTeamMemoImageAction(date, index) {
    const author = getAuthorName() || '名無し';
    const existing = getTeamMemo(date);
    const images = existing.images.filter((_, i) => i !== index);
    try {
      await saveTeamMemo(date, existing.text, author, images, existing.files);
      setTeamData(prev => ({ ...prev, memos: prev.memos.map(m => m.id === date ? { ...m, images } : m) }));
    } catch (err) {
      setTeamError('画像の削除に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }
  async function addTeamMemoFilesAction(date, items) {
    const author = getAuthorName() || '名無し';
    const existing = getTeamMemo(date);
    const files = [...existing.files, ...items];
    try {
      await saveTeamMemo(date, existing.text, author, existing.images, files);
      setTeamData(prev => ({
        ...prev,
        memos: prev.memos.some(m => m.id === date)
          ? prev.memos.map(m => m.id === date ? { ...m, files } : m)
          : [...prev.memos, { id: date, text: existing.text, author, images: existing.images, files, createdAt: Date.now() }],
      }));
    } catch (err) {
      setTeamError('ファイルの保存に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }
  async function removeTeamMemoFileAction(date, index) {
    const author = getAuthorName() || '名無し';
    const existing = getTeamMemo(date);
    const files = existing.files.filter((_, i) => i !== index);
    try {
      await saveTeamMemo(date, existing.text, author, existing.images, files);
      setTeamData(prev => ({ ...prev, memos: prev.memos.map(m => m.id === date ? { ...m, files } : m) }));
    } catch (err) {
      setTeamError('ファイルの削除に失敗しました（' + (err?.message || '不明なエラー') + '）');
    }
  }

  // Replaces the entire app data with a restored backup. Runs the same
  // migration/defaults logic as loadData so older or partial backups still work.
  function replaceAllData(restored) {
    const migratedMemos = {};
    for (const [date, val] of Object.entries(restored.memos || {})) {
      if (typeof val === 'string') migratedMemos[date] = { text: val, images: [], files: [] };
      else migratedMemos[date] = { text: val.text || '', images: val.images || [], files: val.files || [] };
    }
    const migratedProjects = (restored.projects || []).map(p => ({ driveFolderId: '', driveFiles: [], ...p, items: (p.items || []).map(it => ({ images: [], files: [], ...it })) }));
    setData({ ...emptyData(), ...restored, memos: migratedMemos, projects: migratedProjects, settings: { ...emptyData().settings, ...(restored.settings || {}) } });
  }


  // 既存のbase64写真・ファイルをDriveへ移行する。アップロードが全部終わってから
  // 一度だけsetDataするため、途中で失敗しても現在のデータには影響しない。
  // Drive上に残っている実体から、空になった写真・ファイル一覧を作り直す。
  // 追加のみで既存項目は消さないため、何度実行しても安全。
  async function runLibraryRecovery() {
    const result = await recoverLibraryFromDrive(data);
    if (result.ok && result.data) {
      setData(result.data);
    }
    return result;
  }

  async function runMediaMigration(onProgress) {
    const result = await migrateMediaToDrive(data, onProgress);
    if (result.ok && result.data) {
      setData(result.data);
    }
    return result;
  }

  const value = {
    data,
    storageError,
    cloudError,
    runMediaMigration,
    runLibraryRecovery,
    addTask, toggleTask, deleteTask, updateTask,
    addEvent, deleteEvent, updateEvent,
    getMemo, setMemo, clearMemo, addMemoImages, removeMemoImage, updateMemoImageCategories, addMemoFiles, removeMemoFile,
    addNote, deleteNote, updateNote, setNotePriority,
    addPinnedTask, updatePinnedTask, deletePinnedTask,
    addLibraryPhotos, deleteLibraryPhoto, deletePhotosBySrc,
    addLibraryFiles, deleteLibraryFile, renameLibraryFile, addLibraryFolder, deleteLibraryFolder, renameLibraryFolder,
    setLibraryTags, setLibraryComments, setLibraryCategories,
    addProject, setProjectDriveFolderId, setProjectDriveFiles, addProjectDriveFile, removeProjectDriveFile, updateProjectItem, addProjectItem, setProjectItemPriority, deleteProject, deleteProjectItem, sendToProject,
    pasteNoteToCalendar, pasteNoteToProject,
    setSettings, addPhotoCategory, removePhotoCategory, replaceAllData,
    // Space switching + Team data
    space, switchSpace, teamData, teamLoading, teamError, refreshTeamData,
    addTeamNoteAction, updateTeamNoteAction, deleteTeamNoteAction,
    addTeamTaskAction, toggleTeamTaskAction, updateTeamTaskAction, deleteTeamTaskAction,
    addTeamEventAction, deleteTeamEventAction, updateTeamEventAction,
    addTeamProjectAction, deleteTeamProjectAction, updateTeamProjectDriveAction,
    addTeamProjectItemAction, updateTeamProjectItemAction, deleteTeamProjectItemAction,
    getTeamMemo, setTeamMemoAction, addTeamMemoImagesAction, removeTeamMemoImageAction, addTeamMemoFilesAction, removeTeamMemoFileAction,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
