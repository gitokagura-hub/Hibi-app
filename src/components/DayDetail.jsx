import { useMemo, useState } from "react";
import TimeWheel from "./TimeWheel";
import { useResetZoomOnOpen } from "../useResetZoom";

// 画面内の文言は英語で統一する。
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
import { X, Plus, Trash2, Undo2 } from "lucide-react";
import { useData } from "../dataStore";

// 予定の枠線色。CalendarPage.jsxの自動色パレットと揃えている。
const EVENT_COLOR_PALETTE = ["#34C759", "#AF52DE", "#0A84FF", "#FF9F0A", "#FF375F", "#64D2FF"];
const PRIORITY_LEVELS = [
  { value: 0, label: "低" },
  { value: 1, label: "中" },
  { value: 2, label: "高" },
];

// 予定(event)専用: 枠線色 + 表示優先度のピッカー。タスクには出さない。
function ColorPriorityPicker({ color, setColor, priority, setPriority }) {
  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-sub shrink-0 w-10">色</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setColor("")}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] text-ink-sub ${
              color === "" ? "border-ink" : "border-app-line"
            }`}
            aria-label="自動"
          >
            自
          </button>
          {EVENT_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "transparent" }}
              aria-label={`色 ${c}`}
            >
              <span
                className="block rounded-full"
                style={{
                  width: color === c ? 22 : 18,
                  height: color === c ? 22 : 18,
                  backgroundColor: c,
                  boxShadow: color === c ? `0 0 0 2px ${c}55` : "none",
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-sub shrink-0 w-10">優先</span>
        <div className="flex items-center gap-1.5">
          {PRIORITY_LEVELS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium border ${
                priority === p.value ? "bg-ink text-app-bg border-ink" : "border-app-line text-ink-sub"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== 共通: 指定した1日ぶんの予定・タスク・メモを組み立てる =====
// AgendaのagendaDaysと同じ考え方だが、範囲を絞らず単一の日付だけを対象にする。
// (Agendaが+-1ヶ月の外にある日をこの画面で開く可能性は低いが、念のため独立させている)
export function getDayItems(data, teamData, isTeam, date) {
  const events = isTeam ? teamData.events : data.events;
  const tasks = isTeam ? teamData.tasks : data.tasks;
  const memo = (data.memos || {})[date];

  const items = [];
  events
    .filter((e) => e.date === date)
    .forEach((e) =>
      items.push({ kind: "event", id: e.id, time: e.time || "", endTime: e.endTime || "", title: e.title, color: e.color || "", priority: e.priority || 0, raw: e })
    );
  tasks
    .filter((t) => t.date === date)
    .forEach((t) =>
      items.push({
        kind: "task",
        id: t.id,
        time: t.reminderTime || "",
        endTime: t.endTime || "",
        title: t.title,
        completed: t.completed,
        raw: t,
      })
    );

  items.sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  const hasMemo = Boolean((memo?.text || "").trim() || (memo?.images || []).length || (memo?.files || []).length);
  return { items, memoText: memo?.text || "", hasMemo };
}

// 時刻の入力は input[type=time] を使う。iOSではこれが標準のホイール
// (時と分が別々に回る)になり、B欄の新規入力と見た目・操作が揃う。
// step=600 で10分刻みにしている。
// 時刻の表示ボタン。押すと自前のホイール(TimeWheel)を開く。
// iOSの input[type=time] は値が空のとき現在時刻を表示してしまうため使わない。
// 未設定のときは 0:00 起点で開く。
function TimeSelect({ value, onChange, label, min }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="flex items-center gap-1 min-w-0">
      <span className="text-[11px] text-ink-sub shrink-0">{label}</span>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg border border-app-line bg-app-surface px-2 py-1.5 text-sm w-[68px] shrink-0 tabular-nums ${
          value ? "text-ink" : "text-ink-sub/50"
        }`}
      >
        {value || "--:--"}
      </button>
      {value && (
        <button
          onClick={() => onChange("")}
          className="text-ink-sub w-7 h-7 shrink-0 flex items-center justify-center"
          aria-label="Clear"
        >
          <Undo2 size={15} />
        </button>
      )}
      {open && (
        <TimeWheel
          value={value}
          min={min}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

// 予定・タスク1件ぶんの編集フォーム。C(リスト)・E(グリッド)の両方から使う。
// 表示文言はすべて英語。
function ItemEditForm({ item, onSave, onDelete, onCancel, defaultTime }) {
  const [title, setTitle] = useState(item?.title || "");
  const initialStart = item?.time || defaultTime || "";
  const [time, setTime] = useState(initialStart);
  // 終了の初期値は開始と同じにしておく。空のままだとiOSのホイールが現在時刻を
  // 表示してしまい、開始と無関係な時刻(例: 16:49)が入ったように見えるため。
  const [endTime, setEndTime] = useState(item?.endTime || initialStart);
  const isEvent = item?.kind === "event";
  const [color, setColor] = useState(item?.color || "");
  const [priority, setPriority] = useState(item?.priority || 0);

  // 開始を選んだとき、終了が未設定または開始より前なら、開始と同じ時刻に合わせる。
  // 終了を選び直すとき、ゼロから探さずに開始付近から選べるようにするため。
  // 開始を選んだら終了も同じ時刻に合わせる。終了が空のままだとiOSのホイールが
  // 現在時刻を表示してしまい、開始と無関係な時刻に見えるため、必ず値を入れる。
  function handleStart(v) {
    setTime(v);
    if (v && (!endTime || endTime < v)) setEndTime(v);
    if (!v) setEndTime("");
  }

  return (
    <div className="rounded-xl border border-app-line bg-app-surface p-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={item?.kind === "task" ? "Task" : "Title"}
        className="w-full rounded-lg border border-app-line px-3 py-2 text-sm bg-app-bg"
      />
      <div className="flex items-center gap-1.5">
        <TimeSelect value={time} onChange={handleStart} label="Start" />
        <span className="text-ink-sub text-sm">–</span>
        <TimeSelect value={endTime} onChange={setEndTime} label="End" min={time} />
      </div>
      {isEvent && (
        <ColorPriorityPicker color={color} setColor={setColor} priority={priority} setPriority={setPriority} />
      )}
      <div className="flex items-center justify-between pt-1">
        {onDelete ? (
          <button onClick={onDelete} className="text-red-500 text-sm flex items-center gap-1">
            <Trash2 size={14} /> Delete
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button onClick={onCancel} className="text-sm text-ink-sub px-3 py-1.5">Cancel</button>
          <button
            onClick={() => title.trim() && onSave({ title: title.trim(), time, endTime, ...(isEvent ? { color, priority } : {}) })}
            className="text-sm font-semibold bg-ink text-app-bg rounded-lg px-3 py-1.5"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== C: 日専用リスト =====
// スケジュール(予定)を親、タスクをその下にぶら下げて表示する。
// どの予定にも属さないタスクは末尾にまとめる(B欄で作った既存のタスクなど)。
// 画面内の文言はすべて英語で統一する。
function DayList({ date, items }) {
  const { addTask, updateTask, deleteTask, toggleTask, addEvent, updateEvent, deleteEvent, space } = useData();
  const isTeam = space === "team";
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(null); // null | {kind:"event"} | {kind:"task", eventId}

  const events = items.filter((i) => i.kind === "event");
  const tasks = items.filter((i) => i.kind === "task");
  const orphanTasks = tasks.filter((t) => !t.raw?.eventId);

  function save(item, values) {
    if (item.kind === "task") updateTask(item.id, values.title, values.time, values.endTime);
    else updateEvent(item.id, values.time, values.title, values.endTime, values.color, values.priority);
    setEditingId(null);
  }

  function TaskRow({ t }) {
    if (editingId === t.id) {
      return (
        <ItemEditForm
          item={t}
          onCancel={() => setEditingId(null)}
          onSave={(v) => save(t, v)}
          onDelete={() => { deleteTask(t.id); setEditingId(null); }}
        />
      );
    }
    return (
      <button
        onClick={() => setEditingId(t.id)}
        className="w-full flex items-center gap-2.5 py-2 text-left"
      >
        <span
          onClick={(e) => { e.stopPropagation(); if (!isTeam) toggleTask(t.id); }}
          className={`w-4 h-4 rounded-full border-2 shrink-0 ${t.completed ? "bg-green-500 border-green-500" : "border-app-line"}`}
        />
        <span className={`flex-1 text-sm truncate ${t.completed ? "line-through text-ink-sub" : "text-ink"}`}>
          {t.title || "Untitled"}
        </span>
        <span className="text-xs text-ink-sub shrink-0">
          {t.time ? (t.endTime ? `${t.time}–${t.endTime}` : t.time) : ""}
        </span>
      </button>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {items.length === 0 && !adding && (
        <p className="text-sm text-ink-sub py-6 text-center">Nothing scheduled</p>
      )}

      {events.map((ev) => {
        const children = tasks.filter((t) => t.raw?.eventId === ev.id);
        return (
          <div key={ev.id} className="border-b border-app-line pb-2">
            {editingId === ev.id ? (
              <ItemEditForm
                item={ev}
                onCancel={() => setEditingId(null)}
                onSave={(v) => save(ev, v)}
                onDelete={() => { deleteEvent(ev.id); setEditingId(null); }}
              />
            ) : (
              <div className="flex items-center gap-3">
                <button onClick={() => setEditingId(ev.id)} className="flex-1 flex items-center gap-3 py-2.5 text-left min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${ev.color ? "" : "bg-blue-500"}`}
                    style={ev.color ? { border: `2px solid ${ev.color}`, backgroundColor: "transparent" } : undefined}
                  />
                  <span className="flex-1 text-[15px] truncate text-ink">{ev.title || "Untitled"}</span>
                  <span className="text-sm text-ink-sub shrink-0">
                    {ev.time ? (ev.endTime ? `${ev.time}–${ev.endTime}` : ev.time) : "All day"}
                  </span>
                </button>
                {/* このスケジュールにタスクを足す */}
                <button
                  onClick={() => setAdding({ kind: "task", eventId: ev.id })}
                  className="w-7 h-7 rounded-full bg-app-raised border border-app-line text-ink-sub shrink-0 flex items-center justify-center"
                  aria-label="Add task"
                >
                  <Plus size={15} />
                </button>
              </div>
            )}

            {(children.length > 0 || (adding?.kind === "task" && adding.eventId === ev.id)) && (
              <div className="pl-5 space-y-1">
                {children.map((t) => <TaskRow key={t.id} t={t} />)}
                {adding?.kind === "task" && adding.eventId === ev.id && (
                  <ItemEditForm
                    item={{ kind: "task" }}
                    defaultTime={ev.time}
                    onCancel={() => setAdding(null)}
                    onSave={(v) => { addTask(date, v.title, v.time, v.endTime, ev.id); setAdding(null); }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {orphanTasks.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-semibold text-ink-sub uppercase tracking-wide mb-1">Tasks</p>
          <div className="space-y-1">
            {orphanTasks.map((t) => <TaskRow key={t.id} t={t} />)}
          </div>
        </div>
      )}

      {adding?.kind === "event" && (
        <ItemEditForm
          item={{ kind: "event" }}
          onCancel={() => setAdding(null)}
          onSave={(v) => { addEvent(date, v.time, v.title, v.endTime, v.color, v.priority); setAdding(null); }}
        />
      )}

      {!adding && (
        <button
          onClick={() => setAdding({ kind: "event" })}
          className="w-full rounded-xl border border-app-line py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
        >
          <Plus size={14} /> Add Schedule
        </button>
      )}
    </div>
  );
}

// ===== D: 時間グリッド =====
// 5:00始まり24時間。1時間=60px。10分刻みでの入力と揃えるため、開始位置と高さは分単位で計算する。
const GRID_START_MIN = 5 * 60; // 5:00
const PX_PER_HOUR = 60;
const MIN_BLOCK_MIN = 30; // 終了時刻未指定の項目の既定の長さ

function minutesFromGridStart(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m - GRID_START_MIN;
  if (total < 0) total += 24 * 60;
  return total;
}

// 重なっているものを横に並べるための、簡易な列割り当て。
function layoutItems(items) {
  const timed = items
    .filter((it) => it.time)
    .map((it) => {
      const start = minutesFromGridStart(it.time);
      const dur = it.endTime ? Math.max(10, minutesFromGridStart(it.endTime) - start) : MIN_BLOCK_MIN;
      return { ...it, _start: start, _end: start + dur };
    })
    .sort((a, b) => a._start - b._start);

  const clusters = [];
  let current = [];
  let clusterEnd = -1;
  timed.forEach((it) => {
    if (current.length && it._start >= clusterEnd) {
      clusters.push(current);
      current = [];
    }
    current.push(it);
    clusterEnd = Math.max(clusterEnd, it._end);
  });
  if (current.length) clusters.push(current);

  const placed = [];
  clusters.forEach((cluster) => {
    const colEnds = []; // 各列の使用中の終了時刻
    const clusterPlaced = [];
    cluster.forEach((it) => {
      let col = colEnds.findIndex((end) => end <= it._start);
      if (col === -1) { col = colEnds.length; colEnds.push(it._end); }
      else colEnds[col] = it._end;
      clusterPlaced.push({ ...it, _col: col });
    });
    const maxCol = colEnds.length;
    clusterPlaced.forEach((p) => { p._cols = maxCol; placed.push(p); });
  });

  return placed;
}

function DayGrid({ items, onEditItem, className = "flex-1 overflow-y-auto" }) {
  const laidOut = useMemo(() => layoutItems(items), [items]);
  const hours = Array.from({ length: 24 }, (_, i) => (5 + i) % 24);

  return (
    <div className={className}>
      <div className="relative" style={{ height: 24 * PX_PER_HOUR }}>
        {hours.map((h, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-app-line flex items-start"
            style={{ top: i * PX_PER_HOUR }}
          >
            <span className="text-[11px] text-ink-sub w-10 -mt-2 pl-1 bg-app-bg shrink-0">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
        {laidOut.map((it) => {
          const isEvent = it.kind === "event";
          const borderColor = isEvent ? (it.color || "#0A84FF") : (it.completed ? "#86EFAC" : "#22C55E");
          return (
            <button
              key={it.id}
              onClick={() => onEditItem(it)}
              className={`absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden text-[11px] leading-tight border-2 ${
                it.kind === "task" && it.completed ? "line-through" : ""
              }`}
              style={{
                top: (it._start / 60) * PX_PER_HOUR,
                height: Math.max(18, ((it._end - it._start) / 60) * PX_PER_HOUR - 2),
                left: `calc(3rem + ${(it._col / it._cols) * 100}%)`,
                width: `calc(${100 / it._cols}% - 3rem - 4px)`,
                borderColor,
                backgroundColor: borderColor + "14",
                color: borderColor,
              }}
            >
              {it.title || "Untitled"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== 全体: 日専用画面(モーダル) =====
export default function DayDetailScreen({ date, onClose }) {
  useResetZoomOnOpen();
  const { data, teamData, space, addTask, updateTask, deleteTask, addEvent, updateEvent, deleteEvent } = useData();
  const isTeam = space === "team";

  const { items } = useMemo(() => getDayItems(data, teamData, isTeam, date), [data, teamData, isTeam, date]);
  const d = new Date(date + "T00:00:00");
  const wd = WD[d.getDay()];

  return (
    <div className="fixed inset-0 z-50 bg-app-bg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-app-line shrink-0">
        <button onClick={onClose} className="p-1"><X size={20} /></button>
        <h2 className="text-base font-bold">{MONTHS[d.getMonth()]} {d.getDate()}, {wd}</h2>
        <span className="w-7" />
      </div>

      <DayList date={date} items={items} />

    </div>
  );
}



// ===== D: 日付が縦に並ぶリスト =====
// A(月表示)と同列の関係で、上部のボタンで行き来する。
// 日付をタップすると E(その日の時間軸表示) を開く。
export function DateListView({ month, onOpenDate }) {
  const { data, teamData, space } = useData();
  const isTeam = space === "team";

  // 表示中の月の全日付を並べる。項目が無い日も出す(日付を選ぶための一覧なので、
  // 空の日が抜けていると目当ての日を押せなくなる)。
  const days = useMemo(() => {
    const last = new Date(month.y, month.m + 1, 0).getDate();
    const out = [];
    for (let d = 1; d <= last; d++) {
      const ds = `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const { items } = getDayItems(data, teamData, isTeam, ds);
      out.push({ date: ds, day: d, items });
    }
    return out;
  }, [month.y, month.m, data, teamData, isTeam]);

  return (
    <div>
      {days.map((d) => {
        const wd = WD[new Date(d.date + "T00:00:00").getDay()];
        const isWeekend = wd === "Sun" || wd === "Sat";
        return (
          <button
            key={d.date}
            onClick={() => onOpenDate(d.date)}
            className="w-full flex items-start gap-3 px-5 py-3 border-b border-app-line/70 text-left"
          >
            <span className={`w-12 shrink-0 text-[15px] font-bold ${isWeekend ? "text-ink-sub" : "text-ink"}`}>
              {d.day}
              <span className="text-[11px] font-normal ml-1">{wd}</span>
            </span>
            <span className="flex-1 min-w-0 space-y-0.5">
              {d.items.length === 0 ? (
                <span className="block text-sm text-ink-sub/50">—</span>
              ) : (
                d.items.slice(0, 3).map((it) => (
                  <span key={it.id} className="flex items-center gap-1.5 text-sm">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.kind === "event" && it.color ? "" : it.kind === "event" ? "bg-blue-500" : "bg-green-500"}`}
                      style={it.kind === "event" && it.color ? { border: `1.5px solid ${it.color}`, backgroundColor: "transparent" } : undefined}
                    />
                    <span className="truncate flex-1">{it.title || "Untitled"}</span>
                    <span className="text-xs text-ink-sub shrink-0">{it.time || ""}</span>
                  </span>
                ))
              )}
              {d.items.length > 3 && (
                <span className="block text-xs text-ink-sub">+{d.items.length - 3} more</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ===== E: その日の時間軸表示(全画面) =====
// D の日付をタップすると開く。5:00始まりの24時間グリッド。
export function TimeGridScreen({ date, onClose }) {
  useResetZoomOnOpen();
  const { data, teamData, space, updateTask, deleteTask, updateEvent, deleteEvent } = useData();
  const isTeam = space === "team";
  const [editing, setEditing] = useState(null);
  const { items } = useMemo(() => getDayItems(data, teamData, isTeam, date), [data, teamData, isTeam, date]);

  const d = new Date(date + "T00:00:00");
  const wd = WD[d.getDay()];

  return (
    <div className="fixed inset-0 z-50 bg-app-bg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-app-line shrink-0">
        <button onClick={onClose} className="p-1"><X size={20} /></button>
        <h2 className="text-base font-bold">{MONTHS[d.getMonth()]} {d.getDate()}, {wd}</h2>
        <span className="w-7" />
      </div>

      <DayGrid items={items} onEditItem={setEditing} />

      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={() => setEditing(null)}>
          <div className="w-full bg-app-bg rounded-t-2xl p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <ItemEditForm
              item={editing}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                if (editing.kind === "task") updateTask(editing.id, v.title, v.time, v.endTime);
                else updateEvent(editing.id, v.time, v.title, v.endTime, v.color, v.priority);
                setEditing(null);
              }}
              onDelete={() => {
                if (editing.kind === "task") deleteTask(editing.id);
                else deleteEvent(editing.id);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
