import { useMemo, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useData } from "../dataStore";

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
      items.push({ kind: "event", id: e.id, time: e.time || "", endTime: e.endTime || "", title: e.title, raw: e })
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
function TimeSelect({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-ink-sub">{label}</span>
      <input
        type="time"
        step="600"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-app-line bg-app-surface p-2 text-sm w-28 flex-shrink-0"
      />
    </label>
  );
}

// 予定・タスク1件ぶんの編集フォーム。C(リスト)・D(グリッド)の両方から使う。
function ItemEditForm({ item, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(item?.title || "");
  const [time, setTime] = useState(item?.time || "");
  const [endTime, setEndTime] = useState(item?.endTime || "");

  return (
    <div className="rounded-xl border border-app-line bg-app-surface p-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={item?.kind === "task" ? "タスク名" : "予定名"}
        className="w-full rounded-lg border border-app-line px-3 py-2 text-sm bg-app-bg"
      />
      <div className="flex items-center gap-2">
        <TimeSelect value={time} onChange={setTime} label="開始" />
        <span className="text-ink-sub text-sm">〜</span>
        <TimeSelect value={endTime} onChange={setEndTime} label="終了" />
      </div>
      <div className="flex items-center justify-between pt-1">
        {onDelete ? (
          <button onClick={onDelete} className="text-red-500 text-sm flex items-center gap-1">
            <Trash2 size={14} /> 削除
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button onClick={onCancel} className="text-sm text-ink-sub px-3 py-1.5">キャンセル</button>
          <button
            onClick={() => title.trim() && onSave({ title: title.trim(), time, endTime })}
            className="text-sm font-semibold bg-ink text-app-bg rounded-lg px-3 py-1.5"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== C: 日専用リスト =====
function DayList({ date, items }) {
  const { addTask, updateTask, deleteTask, toggleTask, addEvent, updateEvent, deleteEvent, space } = useData();
  const isTeam = space === "team";
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(null); // "event" | "task" | null

  function save(item, values) {
    if (item.kind === "task") updateTask(item.id, values.title, values.time, values.endTime);
    else updateEvent(item.id, values.time, values.title, values.endTime);
    setEditingId(null);
  }
  function addNew(kind, values) {
    if (kind === "task") addTask(date, values.title, values.time, values.endTime);
    else addEvent(date, values.time, values.title, values.endTime);
    setAdding(null);
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {items.length === 0 && !adding && (
        <p className="text-sm text-ink-sub py-6 text-center">この日にはまだ何もありません</p>
      )}
      {items.map((item) =>
        editingId === item.id ? (
          <ItemEditForm
            key={item.id}
            item={item}
            onCancel={() => setEditingId(null)}
            onSave={(v) => save(item, v)}
            onDelete={() => {
              if (item.kind === "task") deleteTask(item.id); else deleteEvent(item.id);
              setEditingId(null);
            }}
          />
        ) : (
          <button
            key={item.id}
            onClick={() => setEditingId(item.id)}
            className="w-full flex items-center gap-3 py-2.5 border-b border-app-line text-left"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.kind === "event" ? "bg-blue-500" : "bg-green-500"}`}
              onClick={(e) => {
                if (item.kind === "task") {
                  e.stopPropagation();
                  if (isTeam) return;
                  toggleTask(item.id);
                }
              }}
            />
            <span className={`flex-1 text-[15px] truncate ${item.kind === "task" && item.completed ? "line-through text-ink-sub" : "text-ink"}`}>
              {item.title || "（無題）"}
            </span>
            <span className="text-sm text-ink-sub shrink-0">
              {item.time ? (item.endTime ? `${item.time}〜${item.endTime}` : item.time) : "終日"}
            </span>
          </button>
        )
      )}

      {adding && (
        <ItemEditForm
          item={{ kind: adding }}
          onCancel={() => setAdding(null)}
          onSave={(v) => addNew(adding, v)}
        />
      )}

      {!adding && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setAdding("event")}
            className="flex-1 rounded-xl border border-app-line py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
          >
            <Plus size={14} /> 予定
          </button>
          <button
            onClick={() => setAdding("task")}
            className="flex-1 rounded-xl border border-app-line py-2.5 text-sm font-semibold flex items-center justify-center gap-1"
          >
            <Plus size={14} /> タスク
          </button>
        </div>
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
        {laidOut.map((it) => (
          <button
            key={it.id}
            onClick={() => onEditItem(it)}
            className={`absolute rounded-md px-1.5 py-0.5 text-left overflow-hidden text-[11px] leading-tight text-white ${
              it.kind === "event" ? "bg-blue-500" : it.completed ? "bg-green-300 line-through" : "bg-green-500"
            }`}
            style={{
              top: (it._start / 60) * PX_PER_HOUR,
              height: Math.max(18, ((it._end - it._start) / 60) * PX_PER_HOUR - 2),
              left: `calc(3rem + ${(it._col / it._cols) * 100}%)`,
              width: `calc(${100 / it._cols}% - 3rem - 4px)`,
            }}
          >
            {it.title || "（無題）"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===== 全体: 日専用画面(モーダル) =====
export default function DayDetailScreen({ date, onClose }) {
  const { data, teamData, space, addTask, updateTask, deleteTask, addEvent, updateEvent, deleteEvent } = useData();
  const isTeam = space === "team";

  const { items } = useMemo(() => getDayItems(data, teamData, isTeam, date), [data, teamData, isTeam, date]);
  const d = new Date(date + "T00:00:00");
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

  return (
    <div className="fixed inset-0 z-50 bg-app-bg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-app-line shrink-0">
        <button onClick={onClose} className="p-1"><X size={20} /></button>
        <h2 className="text-base font-bold">{d.getMonth() + 1}月{d.getDate()}日・{wd}曜日</h2>
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
        const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(d.date + "T00:00:00").getDay()];
        const isWeekend = wd === "日" || wd === "土";
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
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.kind === "event" ? "bg-blue-500" : "bg-green-500"}`} />
                    <span className="truncate flex-1">{it.title || "（無題）"}</span>
                    <span className="text-xs text-ink-sub shrink-0">{it.time || ""}</span>
                  </span>
                ))
              )}
              {d.items.length > 3 && (
                <span className="block text-xs text-ink-sub">ほか{d.items.length - 3}件</span>
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
  const { data, teamData, space, updateTask, deleteTask, updateEvent, deleteEvent } = useData();
  const isTeam = space === "team";
  const [editing, setEditing] = useState(null);
  const { items } = useMemo(() => getDayItems(data, teamData, isTeam, date), [data, teamData, isTeam, date]);

  const d = new Date(date + "T00:00:00");
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

  return (
    <div className="fixed inset-0 z-50 bg-app-bg flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 border-b border-app-line shrink-0">
        <button onClick={onClose} className="p-1"><X size={20} /></button>
        <h2 className="text-base font-bold">{d.getMonth() + 1}月{d.getDate()}日・{wd}曜日</h2>
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
                else updateEvent(editing.id, v.time, v.title, v.endTime);
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
