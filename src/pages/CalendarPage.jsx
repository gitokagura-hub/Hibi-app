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
      <header className="px-5 pt-14 pb-4">
        <h1 className="text-3xl font-semibold">Dayliy Brains</h1>
      </header>

      {/* Calendar */}
      <section className="px-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>{"<"}</button>
            <h2 className="text-lg font-medium">{MONTH_NAMES[calMonth.m]} {calMonth.y}</h2>
            <button onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>{">"}</button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-2">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = dateOf(d);
              const isToday = ds === todayS;
              const isSelected = ds === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(ds)}
                  className={`aspect-square rounded-xl text-sm ${
                    isSelected
                      ? "bg-black text-white"
                      : isToday
                      ? "ring-1 ring-black"
                      : "hover:bg-gray-100"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Scroll Area */}
      <main className="flex-1 overflow-y-auto px-4 pt-5 pb-24">
        <section className="mb-8">
          <h3 className="text-lg font-semibold mb-3">Task</h3>

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
            rows={1}
            className="w-full rounded-2xl border p-4"
          />
        </section>

        <section>
          <h3 className="text-lg font-semibold mb-3">Memo</h3>

          <textarea
            value={memoText}
            onChange={(e) => setMemo(selectedDate, e.target.value)}
            placeholder="Add Memo..."
            className="w-full rounded-2xl border p-4 h-40"
          />
        </section>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation current="calendar" setTab={setTab} />
    </div>
  );
}
