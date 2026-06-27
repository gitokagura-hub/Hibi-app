import { useState, useMemo } from "react";
import { useData, todayStr } from "../dataStore";
import BottomNavigation from "../components/BottomNavigation";

function pad(n) { return String(n).padStart(2, "0"); }
function fmt(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function getMonthGrid(y, m) {
  const startWeekday = new Date(y, m, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage({ setTab }) {
  const { data, addTask, toggleTask, setMemo } = useData();
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [taskInput, setTaskInput] = useState("");

  const grid = useMemo(() => getMonthGrid(calMonth.y, calMonth.m), [calMonth]);
  const todayS = todayStr();
  const dateOf = (d) => fmt(calMonth.y, calMonth.m, d);

  const dayTasks = data.tasks.filter((t) => t.date === selectedDate);
  const memoText = data.memos[selectedDate] || "";

  function handleAddTask(e) {
    if (e.key === "Enter" && taskInput.trim()) {
      addTask(selectedDate, taskInput.trim());
      setTaskInput("");
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white z-20 px-5 pt-safe pb-2">
        <div className="flex items-center justify-between">
          <button>☰</button>
          <h1 className="text-xl font-semibold">Dayliy Brains</h1>
          <button onClick={() => setTab("search")}>🔍</button>
        </div>
      </header>

      {/* Calendar */}
      <section className="flex-none">
        {/* Month */}
        <div className="px-5 pt-2 pb-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>{"<"}</button>
            <h2 className="text-4xl font-bold">{MONTH_NAMES[calMonth.m]}</h2>
            <button onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>{">"}</button>
          </div>
          <p className="text-gray-500 mt-1">{calMonth.y}</p>
        </div>

        {/* Week */}
        <div className="grid grid-cols-7 text-center text-xs text-gray-400 pb-2">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
        </div>

        {/* Calendar */}
        <div className="grid grid-cols-7">
          {grid.map((d, i) => {
            if (!d) return <div key={i} className="h-20 border-r border-b border-gray-100" />;
            const ds = dateOf(d);
            const isToday = ds === todayS;
            const isSelected = ds === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(ds)}
                className={`h-20 border-r border-b border-gray-100 flex flex-col items-start px-2 pt-2 ${isSelected ? "bg-gray-100" : ""}`}
              >
                <span className={`text-lg ${isToday ? "font-bold" : ""}`}>
                  {d}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Scroll */}
      <div className="flex-1 overflow-y-auto">
        <section className="px-5 py-6">
          <h3 className="text-xl font-semibold mb-3">Task</h3>

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
            className="w-full min-h-[140px] rounded-2xl border p-4"
          />
        </section>

        <section className="px-5 pb-32">
          <h3 className="text-xl font-semibold mb-3">Memo</h3>

          <textarea
            value={memoText}
            onChange={(e) => setMemo(selectedDate, e.target.value)}
            placeholder="Add Memo..."
            className="w-full min-h-[220px] rounded-2xl border p-4"
          />
        </section>
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation current="calendar" setTab={setTab} />
    </div>
  );
}
