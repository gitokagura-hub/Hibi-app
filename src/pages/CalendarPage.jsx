import { useState, useMemo, useRef } from "react";
import { useData, todayStr, fileToCompressedDataUrl, fileToDataUrl } from "../dataStore";
import BottomNavigation from "../components/BottomNavigation";
import SpaceSwitcher from "../components/SpaceSwitcher";
import { useConfirm } from "../components/ConfirmModal";

function pad(n) { return String(n).padStart(2, "0"); }
function fmt(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function getMonthGrid(y, m) {
  const startWeekday = new Date(y, m, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);
  return cells;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage({ setTab }) {
  const {
    data, addTask, toggleTask, deleteTask, updateTask, addEvent, deleteEvent, updateEvent,
    getMemo, setMemo, addMemoImages, removeMemoImage, addMemoFiles, removeMemoFile, addNote,
    space, teamData, teamLoading, teamError,
    addTeamTaskAction, toggleTeamTaskAction, updateTeamTaskAction, deleteTeamTaskAction,
    addTeamEventAction, deleteTeamEventAction, updateTeamEventAction,
    getTeamMemo, setTeamMemoAction, addTeamMemoImagesAction, removeTeamMemoImageAction, addTeamMemoFilesAction, removeTeamMemoFileAction,
    addTeamNoteAction,
  } = useData();
  const isTeam = space === "team";
  const confirm = useConfirm();
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [taskInput, setTaskInput] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskText, setEditingTaskText] = useState("");
  const [editingEventId, setEditingEventId] = useState(null);
  const [editingEventText, setEditingEventText] = useState("");
  const [editingEventTime, setEditingEventTime] = useState("");
  const [eventTime, setEventTime] = useState("09:00");
  const [eventTitle, setEventTitle] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const grid = useMemo(() => getMonthGrid(calMonth.y, calMonth.m), [calMonth]);
  const todayS = todayStr();
  const dateOf = (d) => fmt(calMonth.y, calMonth.m, d);

  const cellPreview = useMemo(() => {
    const map = {};
    const events = isTeam ? teamData.events : data.events;
    const tasks = isTeam ? teamData.tasks : data.tasks;
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push({ kind: "event", time: e.time, title: e.text || e.title });
    });
    tasks.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push({ kind: "task", title: t.text || t.title, completed: t.completed });
    });
    return map;
  }, [isTeam, data.events, data.tasks, teamData.events, teamData.tasks]);

  const dayEvents = (isTeam ? teamData.events : data.events)
    .filter((e) => e.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const dayTasks = (isTeam ? teamData.tasks : data.tasks).filter((t) => t.date === selectedDate);
  const memo = isTeam ? getTeamMemo(selectedDate) : getMemo(selectedDate);
  const [teamMemoDraft, setTeamMemoDraft] = useState(null); // local text while editing, to avoid a Sheets write per keystroke
  const memoText = isTeam && teamMemoDraft !== null ? teamMemoDraft : memo.text;

  function selectDate(ds) {
    setSelectedDate(ds);
    setTeamMemoDraft(null);
  }

  function handleAddTask(e) {
    if (e.key === "Enter" && taskInput.trim()) {
      if (isTeam) addTeamTaskAction(selectedDate, taskInput.trim());
      else addTask(selectedDate, taskInput.trim());
      setTaskInput("");
    }
  }

  function handleAddEvent() {
    if (!eventTitle.trim()) return;
    const time = isAllDay ? "" : eventTime;
    if (isTeam) addTeamEventAction(selectedDate, time, eventTitle.trim());
    else addEvent(selectedDate, time, eventTitle.trim());
    setEventTitle("");
  }

  function startEditTask(t) {
    setEditingTaskId(t.id);
    setEditingTaskText(t.title || t.text || "");
  }

  function saveEditTask() {
    const text = editingTaskText.trim();
    const task = dayTasks.find((t) => t.id === editingTaskId);
    if (text && task) {
      if (isTeam) updateTeamTaskAction(task, text);
      else updateTask(editingTaskId, text);
    }
    setEditingTaskId(null);
    setEditingTaskText("");
  }

  function cancelEditTask() {
    setEditingTaskId(null);
    setEditingTaskText("");
  }

  function startEditEvent(e) {
    setEditingEventId(e.id);
    setEditingEventText(e.title || e.text || "");
    setEditingEventTime(e.time || "");
  }

  function saveEditEvent() {
    const text = editingEventText.trim();
    const event = dayEvents.find((e) => e.id === editingEventId);
    if (text && event) {
      if (isTeam) updateTeamEventAction(event, editingEventTime, text);
      else updateEvent(editingEventId, editingEventTime, text);
    }
    setEditingEventId(null);
    setEditingEventText("");
    setEditingEventTime("");
  }

  function cancelEditEvent() {
    setEditingEventId(null);
    setEditingEventText("");
    setEditingEventTime("");
  }

  function handleToggleTask(t) {
    if (isTeam) toggleTeamTaskAction(t);
    else toggleTask(t.id);
  }

  async function handleDeleteTask(id) {
    if (!(await confirm("このタスクを削除しますか？"))) return;
    if (isTeam) deleteTeamTaskAction(id);
    else deleteTask(id);
  }

  async function handleDeleteEvent(id) {
    if (!(await confirm("この予定を削除しますか？"))) return;
    if (isTeam) deleteTeamEventAction(id);
    else deleteEvent(id);
  }

  async function handlePickPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      const dataUrls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      if (isTeam) await addTeamMemoImagesAction(selectedDate, dataUrls);
      else addMemoImages(selectedDate, dataUrls);
    } catch {} finally { setUploadingPhoto(false); }
  }

  async function handlePickFile(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingFile(true);
    try {
      const items = await Promise.all(files.map((f) => fileToDataUrl(f)));
      if (isTeam) await addTeamMemoFilesAction(selectedDate, items);
      else addMemoFiles(selectedDate, items);
    } catch {} finally { setUploadingFile(false); }
  }

  const [memoSent, setMemoSent] = useState(false);
  async function handleSendMemoToNote() {
    if (!memoText.trim() && memo.images.length === 0 && memo.files.length === 0) return;
    if (isTeam) {
      // Team notes don't support images/files yet — text only.
      await addTeamNoteAction(memoText.trim());
    } else {
      addNote(memoText.trim(), "text", memo.images, memo.files);
    }
    setMemoSent(true);
    setTimeout(() => setMemoSent(false), 2000);
  }

  return (
    <div className="h-[100dvh] bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white px-5 pt-8 pb-1">
        <div className="mb-2">
          <h1 className="text-lg font-bold text-center">Dayliy Brains</h1>
        </div>
        <SpaceSwitcher />
      </header>

      {/* Full Screen Scroll */}
      <main className="flex-1 overflow-y-auto">
        {/* ========= PAGE 1 ========= */}
        <section className="flex flex-col" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
          {/* Month */}
          <div className="px-5 py-1">
            <div className="flex items-center justify-between">
              <button onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>{"<"}</button>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-bold">{MONTH_NAMES[calMonth.m]}</h2>
                <span className="text-sm text-gray-500">{calMonth.y}</span>
              </div>
              <button onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>{">"}</button>
            </div>
          </div>

          {/* Week */}
          <div className="grid grid-cols-7 text-center text-xs text-gray-400">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>

          {/* Calendar */}
          <div className="grid grid-cols-7" style={{ gridAutoRows: "78px" }}>
            {grid.map((d, index) => {
              if (!d) return <div key={index} className="border border-gray-100" />;
              const ds = dateOf(d);
              const isToday = ds === todayS;
              const isSelected = ds === selectedDate;
              const items = (cellPreview[ds] || []).slice(0, 4);
              return (
                <button
                  key={index}
                  onClick={() => selectDate(ds)}
                  className={`border border-gray-100 flex flex-col items-start justify-start p-0.5 text-left ${isSelected ? "bg-green-100" : ""}`}
                >
                  <span className={`text-[10px] leading-none mb-0.5 ${isToday ? "font-bold" : ""}`}>{d}</span>
                  <div className="flex flex-col gap-px w-full">
                    {items.map((it, i) => (
                      <span
                        key={i}
                        className={`text-[6px] leading-[1.3] px-0.5 rounded overflow-hidden whitespace-nowrap w-full ${it.kind === "event" ? "bg-gray-200" : "bg-gray-100 text-gray-500"}`}
                      >
                        {it.kind === "event" ? it.title : `${it.completed ? "☑" : "☐"} ${it.title}`}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ========= PAGE 2 ========= */}
        <section className="px-5 py-8" style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom))" }}>
          <h2 className="text-2xl font-semibold mb-6">
            {MONTH_NAMES[calMonth.m]} {Number(selectedDate.split("-")[2])}'s Schedule
          </h2>

          {isTeam && teamError && <p className="text-xs text-red-500 mb-3">{teamError}</p>}
          {isTeam && teamLoading && <p className="text-xs text-gray-400 mb-3">同期中…</p>}

          {/* 1. Schedule */}
          <div className="space-y-3 mb-10">
            {dayEvents.map((e) => (
              <div key={e.id} className={`rounded-2xl border p-4 ${isTeam ? "border-blue-100 bg-blue-50" : ""}`}>
                {editingEventId === e.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={editingEventTime}
                      onChange={(ev) => setEditingEventTime(ev.target.value)}
                      className="rounded-xl border p-2 text-sm w-28 flex-shrink-0"
                    />
                    <input
                      autoFocus
                      value={editingEventText}
                      onChange={(ev) => setEditingEventText(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") saveEditEvent(); if (ev.key === "Escape") cancelEditEvent(); }}
                      className="flex-1 outline-none border-b border-gray-300 text-sm"
                    />
                    <button onClick={saveEditEvent} className="flex-shrink-0 text-xs font-semibold bg-black text-white rounded-lg px-2.5 py-1">保存</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditEvent(e)} className="flex-1 text-left">
                      {e.time ? `${e.time}　${e.text || e.title}` : (e.text || e.title)}
                      {isTeam && <span className="block text-[10px] text-blue-500 mt-1">● {e.author || "名無し"}</span>}
                    </button>
                    <button onClick={() => handleDeleteEvent(e.id)} className="flex-shrink-0 text-gray-400 text-sm">🗑</button>
                  </div>
                )}
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isAllDay}
                onChange={(ev) => setIsAllDay(ev.target.checked)}
                className="w-4 h-4"
              />
              終日（時間なし）
            </label>
            <div className="flex gap-2">
              {!isAllDay && (
                <input
                  type="time"
                  value={eventTime}
                  onChange={(ev) => setEventTime(ev.target.value)}
                  className="rounded-2xl border p-4 w-32"
                />
              )}
              <input
                type="text"
                value={eventTitle}
                onChange={(ev) => setEventTitle(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") handleAddEvent(); }}
                placeholder="Add schedule..."
                className="flex-1 rounded-2xl border p-4"
              />
            </div>
            <button onClick={handleAddEvent} disabled={!eventTitle.trim()} className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold disabled:opacity-30">
              追加
            </button>
          </div>

          {/* 2. Task */}
          <h2 className="text-2xl font-semibold mb-4">Task</h2>
          <div className="space-y-2 mb-3">
            {dayTasks.map((t) => (
              <div key={t.id} className={`flex items-center gap-2 rounded-2xl border p-4 ${isTeam ? "border-blue-100 bg-blue-50" : ""}`}>
                <button onClick={() => handleToggleTask(t)} className="flex-shrink-0 text-lg">
                  {t.completed ? "☑" : "☐"}
                </button>
                {editingTaskId === t.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingTaskText}
                      onChange={(e) => setEditingTaskText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEditTask(); if (e.key === "Escape") cancelEditTask(); }}
                      className="flex-1 outline-none border-b border-gray-300"
                    />
                    <button onClick={saveEditTask} className="flex-shrink-0 text-xs font-semibold bg-black text-white rounded-lg px-2.5 py-1">保存</button>
                  </>
                ) : (
                  <button
                    onClick={() => startEditTask(t)}
                    className={`flex-1 text-left ${t.completed ? "text-gray-400 line-through" : ""}`}
                  >
                    {t.title || t.text}
                    {isTeam && <span className="block text-[10px] text-blue-500">● {t.author || "名無し"}</span>}
                  </button>
                )}
                <button onClick={() => handleDeleteTask(t.id)} className="flex-shrink-0 text-gray-400 text-sm">🗑</button>
              </div>
            ))}
          </div>
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={handleAddTask}
            placeholder="Add Task..."
            className="w-full h-40 rounded-2xl border p-4 mb-3"
          />
          <button onClick={() => { if (taskInput.trim()) { if (isTeam) addTeamTaskAction(selectedDate, taskInput.trim()); else addTask(selectedDate, taskInput.trim()); setTaskInput(""); } }} disabled={!taskInput.trim()} className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold mb-10 disabled:opacity-30">
            タスクを追加
          </button>

          {/* 3. Memo */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-semibold">📝 Memo</h2>
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="rounded-xl border px-3 py-1.5 text-sm bg-white">
                {uploadingFile ? "…" : "📎 ファイル"}
              </button>
              <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="rounded-xl border px-3 py-1.5 text-sm bg-white">
                {uploadingPhoto ? "…" : "📷 写真"}
              </button>
            </div>
          </div>
          <button
            onClick={handleSendMemoToNote}
            disabled={!memoText.trim() && memo.images.length === 0 && memo.files.length === 0}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold mb-2 disabled:opacity-30"
          >
            {memoSent ? "✅ ノートに送信しました" : "📤 このメモをノートへ転送"}
          </button>
          {isTeam && memo.author && <p className="text-[11px] text-blue-500 mb-1.5">● 最終更新: {memo.author}</p>}
          <textarea
            value={memoText}
            onChange={(e) => {
              if (isTeam) setTeamMemoDraft(e.target.value);
              else setMemo(selectedDate, e.target.value);
            }}
            onBlur={() => { if (isTeam && teamMemoDraft !== null) setTeamMemoAction(selectedDate, teamMemoDraft); }}
            placeholder="Add Memo..."
            className="w-full h-64 rounded-2xl border p-4 mb-3"
          />
          {memo.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3">
              {memo.images.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-20 h-20 object-cover rounded-xl border" />
                  <button onClick={() => (isTeam ? removeTeamMemoImageAction(selectedDate, i) : removeMemoImage(selectedDate, i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white text-xs flex items-center justify-center">×</button>
                </div>
              ))}
            </div>
          )}
          {memo.files.length > 0 && (
            <div className="space-y-2 mb-3">
              {memo.files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                  <span className="truncate">📄 {f.name}</span>
                  <button onClick={() => (isTeam ? removeTeamMemoFileAction(selectedDate, i) : removeMemoFile(selectedDate, i))} className="text-gray-400 ml-2">×</button>
                </div>
              ))}
            </div>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePickPhoto} className="hidden" />
          <input ref={fileInputRef} type="file" multiple onChange={handlePickFile} className="hidden" />
        </section>
      </main>

      <BottomNavigation current="calendar" setTab={setTab} />
    </div>
  );
}
