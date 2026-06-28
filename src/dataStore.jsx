import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

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
    projects: [],  // { id, name, items: [{id, text, images, files, createdAt}], driveFolder: '', createdAt }
    settings: { geminiKey: '', chatgptKey: '' },
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
    const migratedProjects = (parsed.projects || []).map(p => ({ driveFolder: '', ...p, items: (p.items || []).map(it => ({ images: [], files: [], ...it })) }));
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
    const project = { id: uid(), name, items: [], driveFolder: '', createdAt: Date.now() };
    setData(prev => ({ ...prev, projects: [...prev.projects, project] }));
  }
  function setProjectDriveFolder(projectId, folderName) {
    setData(prev => ({ ...prev, projects: prev.projects.map(p => p.id === projectId ? { ...p, driveFolder: folderName } : p) }));
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

  const value = {
    data,
    storageError,
    addTask, toggleTask, deleteTask,
    addEvent, deleteEvent,
    getMemo, setMemo, addMemoImages, removeMemoImage, addMemoFiles, removeMemoFile,
    addNote, deleteNote, updateNote,
    addProject, setProjectDriveFolder, updateProjectItem, addProjectItem, deleteProject, deleteProjectItem, sendToProject,
    pasteNoteToCalendar, pasteNoteToProject,
    setSettings,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}

import { useState, useRef, useEffect } from "react";
import { Layout, AIConnections } from "../components";
import { useData, todayStr, fileToCompressedDataUrl, fileToDataUrl, formatDateTime } from "../dataStore";

function deriveTitle(text) {
  const firstLine = text.split("\n")[0];
  return firstLine.length > 28 ? firstLine.slice(0, 28) + "…" : firstLine;
}

function VoiceCapture({ onClose, onSave }) {
  const [stage, setStage] = useState("listening");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const timerRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((stream) => { mediaRef.current = stream; }).catch(() => {});
    return () => {
      clearInterval(timerRef.current);
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleStop() {
    clearInterval(timerRef.current);
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    setStage("review");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={stage === "review" ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {stage === "listening" ? (
          <div className="flex flex-col items-center py-6">
            <div className="h-16 w-16 rounded-full border bg-white shadow-lg text-2xl flex items-center justify-center mb-4 animate-pulse">🎤</div>
            <p className="text-gray-500 text-sm mb-1">Listening…</p>
            <p className="text-gray-400 text-xs mb-6">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <button onClick={handleStop} className="rounded-2xl border px-6 py-3">Stop</button>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold mb-2">Conversation</h2>
            <p className="text-sm text-gray-500 mb-3">Voice transcription isn't connected yet — type a summary to save.</p>
            <textarea
              autoFocus
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="What did you talk about?"
              className="w-full rounded-2xl border p-4 h-32 mb-3"
            />
            <button onClick={() => onSave(transcript.trim() || "(voice note)")} className="w-full rounded-2xl bg-black text-white p-4">
              Save to Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PasteChooser({ note, mode: initialMode, projects, onClose, onPasteToCalendar, onPasteToProject }) {
  const [mode, setMode] = useState(initialMode || null);
  const [date, setDate] = useState(todayStr());

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {mode === "calendar" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Calendar</h2>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl border p-4 mb-3" />
            <button onClick={() => onPasteToCalendar(date)} className="w-full rounded-2xl bg-black text-white p-4">Add as Task</button>
          </>
        )}
        {mode === "projects" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Project</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.length === 0 && <p className="text-gray-400">No projects yet</p>}
              {projects.map((p) => (
                <button key={p.id} onClick={() => onPasteToProject(p.id)} className="w-full text-left rounded-2xl border p-4">{p.name}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectPickerSheet({ projects, onClose, onPick }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        <h2 className="text-lg font-semibold mb-4">送信先のプロジェクトを選択</h2>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {projects.length === 0 && <p className="text-gray-400">プロジェクトがまだありません</p>}
          {projects.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="w-full text-left rounded-2xl border p-4">📁 {p.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FullScreenComposer({
  text, setText, pendingImages, setPendingImages, pendingFiles, setPendingFiles,
  uploading, onPickPhoto, onPickFile, onVoice, onSave, onSend, onClose, isEditing,
}) {
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500">閉じる</button>
        <span className="font-semibold">{isEditing ? "Edit Note" : "New Note"}</span>
        <div className="w-10" />
      </div>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="思いつきやアイデアを書き出す（壁打ち）..."
        className="flex-1 w-full px-5 py-4 text-[16px] outline-none resize-none"
      />

      <div className="px-5">
        {pendingImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {pendingImages.map((src, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={src} alt="" className="w-16 h-16 object-cover rounded-xl border" />
                <button onClick={() => setPendingImages((p) => p.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white text-xs flex items-center justify-center">×</button>
              </div>
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <span className="truncate">📄 {f.name}</span>
                <button onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))} className="text-gray-400 ml-2">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3 mb-3">
          <button onClick={onVoice} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">🎤 ボイチャ</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">📎 ファイル</button>
          <button onClick={() => photoInputRef.current?.click()} disabled={uploading} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">📷 写真</button>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhoto} className="hidden" />
        <input ref={fileInputRef} type="file" multiple onChange={onPickFile} className="hidden" />
        <div className="flex gap-2">
          <button onClick={onSave} className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold">保存</button>
          {!isEditing && (
            <button onClick={onSend} className="flex-1 rounded-xl bg-black text-white px-4 py-3 text-sm font-semibold">📤 Send</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotesPage({ setTab }) {
  const { data, addNote, deleteNote, updateNote, pasteNoteToCalendar, pasteNoteToProject, sendToProject } = useData();
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState(null);
  const [pasteMode, setPasteMode] = useState(null);
  const [selectedAI, setSelectedAI] = useState("ChatGPT");
  const [now, setNow] = useState(Date.now());
  const sorted = [...data.notes].sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function resetComposer() {
    setText("");
    setPendingImages([]);
    setPendingFiles([]);
  }

  function handleSaveNote() {
    if (editingNoteId) {
      updateNote(editingNoteId, text.trim());
      resetComposer();
      setEditingNoteId(null);
      setComposerOpen(false);
      return;
    }
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    addNote(text.trim(), "text", pendingImages, pendingFiles);
    resetComposer();
    setComposerOpen(false);
  }

  function handleOpenNote(n) {
    setEditingNoteId(n.id);
    setText(n.text || "");
    setPendingImages(n.images || []);
    setPendingFiles(n.files || []);
    setComposerOpen(true);
  }

  function handleOpenNewComposer() {
    setEditingNoteId(null);
    resetComposer();
    setComposerOpen(true);
  }

  function handleCloseComposer() {
    setEditingNoteId(null);
    resetComposer();
    setComposerOpen(false);
  }

  function handleSendPick(projectId) {
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    sendToProject(projectId, text.trim(), pendingImages, pendingFiles);
    resetComposer();
    setProjectPickerOpen(false);
    setComposerOpen(false);
  }

  async function handlePickPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const dataUrls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      setPendingImages((prev) => [...prev, ...dataUrls]);
    } catch {} finally { setUploading(false); }
  }

  async function handlePickFile(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const items = await Promise.all(files.map((f) => fileToDataUrl(f)));
      setPendingFiles((prev) => [...prev, ...items]);
    } catch {} finally { setUploading(false); }
  }

  return (
    <Layout title="Notes" subtitle="Ideas & Conversations" current="notes" setTab={setTab}>
      <div className="px-5">
        <div className="mb-4 overflow-x-auto">
          <AIConnections selected={selectedAI} onSelect={setSelectedAI} />
        </div>

        <button
          onClick={handleOpenNewComposer}
          className="w-full text-left rounded-3xl border p-4 mb-6 text-gray-400 text-[15px]"
        >
          思いつきやアイデアを書き出す（壁打ち）...
        </button>

        <div className="space-y-4 pb-10">
          {sorted.length === 0 && <p className="text-gray-400">No notes yet</p>}
          {sorted.map((n) => (
            <div key={n.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <button onClick={() => handleOpenNote(n)} className="w-full text-left">
                {n.text && <p className="text-[15px] mb-3 whitespace-pre-wrap leading-relaxed">{n.source === "voice" ? "🎤 " : ""}{n.text}</p>}
                {n.images && n.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto mb-3">
                    {n.images.map((src, i) => (
                      <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border flex-shrink-0" />
                    ))}
                  </div>
                )}
                {n.files && n.files.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {n.files.map((f, i) => (
                      <div key={i} className="text-xs rounded-lg border p-2 truncate">📄 {f.name}</div>
                    ))}
                  </div>
                )}
              </button>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400 font-semibold">作成日: {formatDateTime(n.createdAt)}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => { setPasteTarget(n); setPasteMode("calendar"); }} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">📅 カレンダーへ貼付</button>
                  <button onClick={() => { setPasteTarget(n); setPasteMode("projects"); }} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">📁 プロジェクトへ貼付</button>
                </div>
              </div>
              <button onClick={() => deleteNote(n.id)} className="text-gray-400 text-xs mt-2">Delete</button>
            </div>
          ))}
        </div>
      </div>

      {composerOpen && (
        <FullScreenComposer
          text={text} setText={setText}
          pendingImages={pendingImages} setPendingImages={setPendingImages}
          pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
          uploading={uploading}
          onPickPhoto={handlePickPhoto}
          onPickFile={handlePickFile}
          onVoice={() => setVoiceOpen(true)}
          onSave={handleSaveNote}
          onSend={() => setProjectPickerOpen(true)}
          onClose={handleCloseComposer}
          isEditing={!!editingNoteId}
        />
      )}
      {projectPickerOpen && (
        <ProjectPickerSheet
          projects={data.projects}
          onClose={() => setProjectPickerOpen(false)}
          onPick={handleSendPick}
        />
      )}
      {voiceOpen && (
        <VoiceCapture onClose={() => setVoiceOpen(false)} onSave={(t) => { addNote(t, "voice"); setVoiceOpen(false); }} />
      )}
      {pasteTarget && (
        <PasteChooser
          note={pasteTarget}
          mode={pasteMode}
          projects={data.projects}
          onClose={() => { setPasteTarget(null); setPasteMode(null); }}
          onPasteToCalendar={(date) => { pasteNoteToCalendar(pasteTarget, date); setPasteTarget(null); setPasteMode(null); }}
          onPasteToProject={(pid) => { pasteNoteToProject(pasteTarget, pid); setPasteTarget(null); setPasteMode(null); }}
        />
      )}
    </Layout>
  );
}

import { useState, useRef } from "react";
import { Layout } from "../components";
import { useData, formatDateTime } from "../dataStore";

function FullScreenItemEditor({ item, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500">← 戻る</button>
        <span className="font-semibold">編集</span>
        <div className="w-10" />
      </div>

      <textarea
        autoFocus
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 w-full px-5 py-4 text-[16px] outline-none resize-none"
      />

      <div className="px-5" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        {item.images && item.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {item.images.map((src, i) => (
              <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border flex-shrink-0" />
            ))}
          </div>
        )}
        {item.files && item.files.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {item.files.map((f, i) => (
              <div key={i} className="text-xs rounded-lg border p-2 truncate">📄 {f.name}</div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-xl bg-black text-white px-4 py-3 text-sm font-semibold">← 戻る</button>
      </div>
    </div>
  );
}

export default function ProjectsPage({ setTab }) {
  const { data, addProject, setProjectDriveFolder, updateProjectItem, addProjectItem, deleteProject, deleteProjectItem } = useData();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // { projectId, itemId }
  const [newMemoText, setNewMemoText] = useState({}); // { [projectId]: text }
  const rowRefs = useRef({});

  function handleAddMemo(projectId) {
    const text = (newMemoText[projectId] || "").trim();
    if (!text) return;
    addProjectItem(projectId, text);
    setNewMemoText((prev) => ({ ...prev, [projectId]: "" }));
  }

  function handleAdd() {
    if (!name.trim()) return;
    addProject(name.trim());
    setName("");
  }

  function handleToggle(p) {
    const willOpen = openId !== p.id;
    setOpenId(willOpen ? p.id : null);
    if (willOpen) {
      // jump so this project's row sits at the top of the view, since opening
      // its room content can otherwise push it out of sight below the fold.
      requestAnimationFrame(() => {
        rowRefs.current[p.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function handleDeleteProject(e, p) {
    e.stopPropagation();
    if (window.confirm(`「${p.name}」を削除しますか？中の項目もすべて削除されます。`)) {
      deleteProject(p.id);
      if (openId === p.id) setOpenId(null);
    }
  }

  const editingItem = editing
    ? data.projects.find((p) => p.id === editing.projectId)?.items.find((it) => it.id === editing.itemId)
    : null;

  return (
    <Layout title="Projects" current="projects" setTab={setTab}>
      <div className="px-5">
        <div className="rounded-3xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="font-bold text-[15px]">項目名（プロジェクト名）</span>
            <span className="text-xs text-gray-500 font-semibold">作成日</span>
          </div>

          {data.projects.length === 0 && (
            <div className="p-5 text-gray-400 text-sm">プロジェクトはまだありません</div>
          )}

          {data.projects.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} ref={(el) => (rowRefs.current[p.id] = el)} className="border-b border-gray-200 last:border-b-0 scroll-mt-2">
                <button onClick={() => handleToggle(p)} className="w-full text-left px-4 py-5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{formatDateTime(p.createdAt).split(" ")[0]}</span>
                      <span onClick={(e) => handleDeleteProject(e, p)} className="text-gray-400 text-sm px-1">🗑</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-5">
                    <div className="bg-gray-100 rounded-2xl p-3.5">
                      <div className="text-xs font-bold text-gray-600 mb-2">📂 連携ルーム・統合レイヤー</div>

                      <div className="text-[13px] text-gray-800 mb-3 space-y-1">
                        <div>• [ノート連携] ノートから転送されたアイデアを{p.items.length}件格納</div>
                        <div>
                          • [Google Drive]{" "}
                          {p.driveFolder ? `「${p.driveFolder}」フォルダに連携中` : "未連携"}
                        </div>
                      </div>

                      <input
                        value={p.driveFolder}
                        onChange={(e) => setProjectDriveFolder(p.id, e.target.value)}
                        placeholder="連携するDriveフォルダ名を入力..."
                        className="w-full rounded-lg border p-2 text-xs mb-3 bg-white"
                      />

                      <div className="mb-3">
                        <textarea
                          value={newMemoText[p.id] || ""}
                          onChange={(e) => setNewMemoText((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleAddMemo(p.id);
                            }
                          }}
                          placeholder="このプロジェクトに新しいメモを書く..."
                          className="w-full rounded-lg border p-2 text-xs bg-white resize-none mb-1.5"
                          rows={2}
                        />
                        <button
                          onClick={() => handleAddMemo(p.id)}
                          className="w-full rounded-lg bg-black text-white text-xs font-semibold py-1.5"
                        >
                          ＋ メモを追加
                        </button>
                      </div>

                      {p.items.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {p.items.map((item) => (
                            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-2.5">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={() => setEditing({ projectId: p.id, itemId: item.id })}
                                  className="flex-1 text-left text-[13px] whitespace-pre-wrap"
                                >
                                  {item.text || <span className="text-gray-400">（空のメモ）</span>}
                                </button>
                                <button onClick={() => deleteProjectItem(p.id, item.id)} className="text-gray-400 text-sm flex-shrink-0">🗑</button>
                              </div>
                              {item.images && item.images.length > 0 && (
                                <div className="flex gap-1.5 overflow-x-auto mt-1.5">
                                  {item.images.map((src, i) => (
                                    <img key={i} src={src} alt="" className="w-12 h-12 object-cover rounded-lg border flex-shrink-0" />
                                  ))}
                                </div>
                              )}
                              {item.files && item.files.length > 0 && (
                                <div className="space-y-1 mt-1.5">
                                  {item.files.map((f, i) => (
                                    <div key={i} className="text-[11px] truncate">📄 {f.name}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">
                          🔄 転送ボタン
                        </button>
                        <button onClick={() => setTab("calendar")} className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">
                          📅 カレンダー連携
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pb-32">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="New project name..."
            className="w-full rounded-2xl border p-4 mb-2"
          />
          <button onClick={handleAdd} className="rounded-xl border px-4 py-2">Add</button>
        </div>
      </div>

      {editing && editingItem && (
        <FullScreenItemEditor
          item={editingItem}
          onChange={(text) => updateProjectItem(editing.projectId, editing.itemId, text)}
          onClose={() => setEditing(null)}
        />
      )}
    </Layout>
  );
}
