import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  isTeamConnected, getAuthorName, ensureTeamSheetReady,
  fetchTeamNotes, addTeamNote, updateTeamNote, deleteTeamNote,
  fetchTeamTasks, addTeamTask, updateTeamTask, deleteTeamTask,
  fetchTeamEvents, addTeamEvent, deleteTeamEvent,
  fetchTeamProjects, addTeamProject, deleteTeamProject, updateTeamProjectDrive,
  fetchTeamProjectItems, addTeamProjectItem, updateTeamProjectItem, deleteTeamProjectItem,
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

// Reads an image file and resizes/compresses it to a base64 data URL,
// so photos can be stored directly in the browser without any external service.
export function fileToCompressedDataUrl(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Reads any file (not just images) as a plain base64 data URL, no compression.
// Used for the generic "file attachment" feature.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function emptyData() {
  return {
    tasks: [],     // { id, date, title, completed, createdAt }
    events: [],    // { id, date, time, title, createdAt }
    memos: {},     // { [date]: { text, images: [], files: [] } }
    notes: [],     // { id, text, images: [], files: [], source: 'text'|'voice', createdAt }
    projects: [],  // { id, name, items: [{id, text, images, files, createdAt}], driveFolderId: '', driveFiles: [], createdAt }
    settings: { geminiKey: '', chatgptKey: '', claudeKey: '' },
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
  const saveTimer = useRef(null);
  const initialLoad = useRef(true);

  // ---- Space switching (Personal vs Team) ----
  // "space" only controls which data the screens read/write to right now.
  // Personal data lives in `data` above (localStorage, untouched by this).
  // Team data lives in `teamData` below, synced with the shared Google Sheet.
  const [space, setSpace] = useState(() => localStorage.getItem('hibi-current-space') || 'personal');
  const [teamData, setTeamData] = useState({ notes: [], tasks: [], events: [], projects: [], projectItems: [] });
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
      const [notes, tasks, events, projects, projectItems] = await Promise.all([
        fetchTeamNotes(), fetchTeamTasks(), fetchTeamEvents(), fetchTeamProjects(), fetchTeamProjectItems(),
      ]);
      setTeamData({ notes, tasks, events, projects, projectItems });
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


  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ok = saveData(data);
      setStorageError(!ok);
    }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data]);

  function addTask(date, title) {
    const task = { id: uid(), date, title, completed: false, createdAt: Date.now() };
    setData(prev => ({ ...prev, tasks: [...prev.tasks, task] }));
  }
  function toggleTask(id) {
    setData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t) }));
  }
  function updateTask(id, title) {
    setData(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, title } : t) }));
  }
  function deleteTask(id) {
    setData(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  }
  function addEvent(date, time, title) {
    const event = { id: uid(), date, time, title, createdAt: Date.now() };
    setData(prev => ({ ...prev, events: [...prev.events, event] }));
  }
  function deleteEvent(id) {
    setData(prev => ({ ...prev, events: prev.events.filter(e => e.id !== id) }));
  }
  function getMemo(date) {
    return data.memos[date] || { text: '', images: [], files: [] };
  }
  function setMemo(date, text) {
    setData(prev => ({ ...prev, memos: { ...prev.memos, [date]: { ...(prev.memos[date] || { images: [], files: [] }), text } } }));
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
  function addNote(text, source, images, files) {
    const note = { id: uid(), text, source: source || 'text', images: images || [], files: files || [], createdAt: Date.now() };
    setData(prev => ({ ...prev, notes: [...prev.notes, note] }));
  }
  function deleteNote(id) {
    setData(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== id) }));
  }
  function updateNote(id, text) {
    setData(prev => ({ ...prev, notes: prev.notes.map(n => n.id === id ? { ...n, text } : n) }));
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
  function updateProjectItem(projectId, itemId, text) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: p.items.map(it => it.id === itemId ? { ...it, text } : it) }
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
  function sendToProject(projectId, text, images, files) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text, images: images || [], files: files || [], createdAt: Date.now() }] }
        : p),
    }));
  }
  function addProjectItem(projectId, text) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text, images: [], files: [], createdAt: Date.now() }] }
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
        ? { ...p, items: [...p.items, { id: uid(), text: note.text, images: note.images || [], files: note.files || [], createdAt: Date.now() }] }
        : p),
    }));
    deleteNote(note.id);
  }
  function setSettings(patch) {
    setData(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }));
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

  const value = {
    data,
    storageError,
    addTask, toggleTask, deleteTask, updateTask,
    addEvent, deleteEvent,
    getMemo, setMemo, addMemoImages, removeMemoImage, addMemoFiles, removeMemoFile,
    addNote, deleteNote, updateNote,
    addProject, setProjectDriveFolderId, setProjectDriveFiles, addProjectDriveFile, removeProjectDriveFile, updateProjectItem, addProjectItem, deleteProject, deleteProjectItem, sendToProject,
    pasteNoteToCalendar, pasteNoteToProject,
    setSettings, replaceAllData,
    // Space switching + Team data
    space, switchSpace, teamData, teamLoading, teamError, refreshTeamData,
    addTeamNoteAction, updateTeamNoteAction, deleteTeamNoteAction,
    addTeamTaskAction, toggleTeamTaskAction, updateTeamTaskAction, deleteTeamTaskAction,
    addTeamEventAction, deleteTeamEventAction,
    addTeamProjectAction, deleteTeamProjectAction, updateTeamProjectDriveAction,
    addTeamProjectItemAction, updateTeamProjectItemAction, deleteTeamProjectItemAction,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
