import { useState, useMemo, useRef } from "react";
import { useData, todayStr, fileToCompressedDataUrl } from "../dataStore";
import BottomNavigation from "../components/BottomNavigation";

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
  const { data, addTask, toggleTask, addEvent, deleteEvent, getMemo, setMemo, addMemoImages, removeMemoImage } = useData();
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [taskInput, setTaskInput] = useState("");
  const [eventTime, setEventTime] = useState("09:00");
  const [eventTitle, setEventTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const page2Ref = useRef(null);
  const fileInputRef = useRef(null);

  const grid = useMemo(() => getMonthGrid(calMonth.y, calMonth.m), [calMonth]);
  const todayS = todayStr();
  const dateOf = (d) => fmt(calMonth.y, calMonth.m, d);

  const dayHasItems = useMemo(() => {
    const set = new Set();
    data.events.forEach((e) => set.add(e.date));
    data.tasks.forEach((t) => set.add(t.date));
    return set;
  }, [data.events, data.tasks]);

  const dayEvents = data.events.filter((e) => e.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const dayTasks = data.tasks.filter((t) => t.date === selectedDate);
  const memo = getMemo(selectedDate);

  function selectDate(ds) {
    setSelectedDate(ds);
    page2Ref.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleAddTask(e) {
    if (e.key === "Enter" && taskInput.trim()) {
      addTask(selectedDate, taskInput.trim());
      setTaskInput("");
    }
  }

  function handleAddEvent() {
    if (!eventTitle.trim()) return;
    addEvent(selectedDate, eventTime, eventTitle.trim());
    setEventTitle("");
  }

  async function handlePickMemoPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const dataUrls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      addMemoImages(selectedDate, dataUrls);
    } catch {
      // ignore unreadable files
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white px-5 pt-8 pb-1">
        <div className="flex items-center justify-between">
          <button>☰</button>
          <h1 className="text-[10px] font-semibold">Dayliy Brains</h1>
          <div className="w-5" />
        </div>
      </header>

      {/* Full Screen Scroll */}
      <main className="flex-1 overflow-y-auto snap-y snap-mandatory">
        {/* ========= PAGE 1 ========= */}
        <section className="snap-start h-screen flex flex-col pb-20">
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
          <div className="flex-1 min-h-0 grid grid-cols-7 grid-rows-6">
            {grid.map((d, index) => {
              if (!d) return <div key={index} className="border border-gray-100" />;
              const ds = dateOf(d);
              const isToday = ds === todayS;
              const isSelected = ds === selectedDate;
              const hasItems = dayHasItems.has(ds);
              return (
                <button
                  key={index}
                  onClick={() => selectDate(ds)}
                  className={`border border-gray-100 flex flex-col items-start justify-start p-2 text-lg relative ${isSelected ? "bg-gray-100" : ""} ${isToday ? "font-bold" : ""}`}
                >
                  {d}
                  {hasItems && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-black" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* ========= PAGE 2 ========= */}
        <section ref={page2Ref} className="snap-start min-h-screen px-5 py-8">
          <h2 className="text-2xl font-semibold mb-6">
            {MONTH_NAMES[calMonth.m]} {Number(selectedDate.split("-")[2])}'s Schedule
          </h2>

          <div className="space-y-3 mb-10">
            {dayEvents.map((e) => (
              <button key={e.id} onClick={() => deleteEvent(e.id)} className="w-full text-left rounded-2xl border p-4">
                {e.time}　{e.title}
              </button>
            ))}
            <div className="flex gap-2">
              <input
                type="time"
                value={eventTime}
                onChange={(ev) => setEventTime(ev.target.value)}
                className="rounded-2xl border p-4 w-32"
              />
              <input
                type="text"
                value={eventTitle}
                onChange={(ev) => setEventTitle(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") handleAddEvent(); }}
                placeholder="Add schedule..."
                className="flex-1 rounded-2xl border p-4"
              />
            </div>
          </div>

          <h2 className="text-2xl font-semibold mb-4">Task</h2>
          <div className="space-y-2 mb-3">
            {dayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className={`w-full text-left rounded-2xl border p-4 ${t.completed ? "text-gray-400 line-through" : ""}`}
              >
                {t.title}
              </button>
            ))}
          </div>
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={handleAddTask}
            placeholder="Add Task..."
            className="w-full h-40 rounded-2xl border p-4 mb-10"
          />

          <h2 className="text-2xl font-semibold mb-4">📝 Memo</h2>
          <textarea
            value={memo.text}
            onChange={(e) => setMemo(selectedDate, e.target.value)}
            placeholder="Add Memo..."
            className="w-full h-64 rounded-2xl border p-4 mb-3"
          />
          {memo.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto mb-3">
              {memo.images.map((src, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={src} alt="" className="w-20 h-20 object-cover rounded-xl border" />
                  <button
                    onClick={() => removeMemoImage(selectedDate, i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-2xl border px-4 py-2 text-sm"
          >
            {uploading ? "Adding…" : "📷 Add Photo"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePickMemoPhoto} className="hidden" />
        </section>
      </main>

      <BottomNavigation current="calendar" setTab={setTab} />
    </div>
  );
}
