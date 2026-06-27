import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'dayliybrains-data';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function emptyData() {
  return {
    tasks: [],     // { id, date, title, completed, createdAt }
    events: [],    // { id, date, time, title, createdAt }
    memos: {},     // { [date]: text }
    notes: [],     // { id, text, source: 'text'|'voice', createdAt }
    projects: [],  // { id, name, items: [{id, text, createdAt}], createdAt }
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? { ...emptyData(), ...parsed } : emptyData();
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
  const saveTimer = useRef(null);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveData(data), 400);
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
  function setMemo(date, text) {
    setData(prev => ({ ...prev, memos: { ...prev.memos, [date]: text } }));
  }
  function addNote(text, source) {
    const note = { id: uid(), text, source: source || 'text', createdAt: Date.now() };
    setData(prev => ({ ...prev, notes: [...prev.notes, note] }));
  }
  function deleteNote(id) {
    setData(prev => ({ ...prev, notes: prev.notes.filter(n => n.id !== id) }));
  }
  function addProject(name) {
    const project = { id: uid(), name, items: [], createdAt: Date.now() };
    setData(prev => ({ ...prev, projects: [...prev.projects, project] }));
  }
  function pasteNoteToCalendar(note, date) {
    addTask(date, note.text);
    deleteNote(note.id);
  }
  function pasteNoteToProject(note, projectId) {
    setData(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === projectId
        ? { ...p, items: [...p.items, { id: uid(), text: note.text, createdAt: Date.now() }] }
        : p),
    }));
    deleteNote(note.id);
  }

  const value = {
    data,
    addTask, toggleTask, deleteTask,
    addEvent, deleteEvent,
    setMemo,
    addNote, deleteNote,
    addProject,
    pasteNoteToCalendar, pasteNoteToProject,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
