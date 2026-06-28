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
    addNote, deleteNote,
    addProject, setProjectDriveFolder, updateProjectItem, deleteProject, deleteProjectItem,
    pasteNoteToCalendar, pasteNoteToProject,
    setSettings,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
