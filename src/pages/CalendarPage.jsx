import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Paperclip, Camera, PencilLine, FileText, Rows3, CalendarDays, Trash2 } from "lucide-react";
import { useData, todayStr, fileToCompressedDataUrl, fileToDataUrl } from "../dataStore";
import { handleEnterToConfirm } from "../useEnterConfirm";
import BottomNavigation from "../components/BottomNavigation";
import SpaceSwitcher from "../components/SpaceSwitcher";
import { useConfirm } from "../components/ConfirmModal";
import MediaImg from "../components/MediaImg";
import DayDetailScreen, { DateListView, TimeGridScreen } from "../components/DayDetail";
import TimeWheel from "../components/TimeWheel";

function pad(n) { return String(n).padStart(2, "0"); }
function fmt(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function getMonthGrid(y, m) {
  const startWeekday = new Date(y, m, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // 最後の週を7の倍数まで埋めたら終わり(6週目が丸々空になる月では、
  // その空白行を作らない。以前は常に42マス固定だったため、8月の
  // ように5週間で収まる月でも6週目分の空白が下に残っていた)。
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

// iOS標準カレンダー(ダーク)の予定チップ: 色の25%透過を地に、先頭に
// 同色のドット、白文字。タイトルから決定論的に色を割り当てる
// (同じ予定は常に同じ色)。パレットはiOSカレンダー系。
const EVENT_COLORS = ["#34C759", "#AF52DE", "#0A84FF", "#FF9F0A", "#FF375F", "#64D2FF"];
function eventColorFor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

export default function CalendarPage({ setTab }) {
  const {
    data, addTask, toggleTask, deleteTask, updateTask, addEvent, deleteEvent, updateEvent,
    addPinnedTask, updatePinnedTask, deletePinnedTask,
    getMemo, setMemo, clearMemo, addMemoImages, removeMemoImage, addMemoFiles, removeMemoFile, addNote,
    space, teamData, teamLoading, teamError,
    addTeamTaskAction, toggleTeamTaskAction, updateTeamTaskAction, deleteTeamTaskAction,
    addTeamEventAction, deleteTeamEventAction, updateTeamEventAction,
    getTeamMemo, setTeamMemoAction, addTeamMemoImagesAction, removeTeamMemoImageAction, addTeamMemoFilesAction, removeTeamMemoFileAction,
    addTeamNoteAction,
  } = useData();
  const isTeam = space === "team";
  const confirm = useConfirm();
  const mainRef = useRef(null);
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [taskDrafts, setTaskDrafts] = useState([{ id: "t0", text: "", reminderTime: "" }]);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskText, setEditingTaskText] = useState("");
  const [editingTaskReminderTime, setEditingTaskReminderTime] = useState("");
  const [editingEventId, setEditingEventId] = useState(null);
  // Agendaの日付見出しをタップすると、その日専用の画面(C: リスト / D: グリッド)を開く。
  const [dayDetailDate, setDayDetailDate] = useState(null);
  // A(月表示) と D(縦列の時間表示) の切り替え。同列の関係で、上部のボタンで行き来する。
  const [calView, setCalView] = useState("month"); // "month"(A) | "list"(D)
  // D の日付タップで開く E(その日の時間軸表示)
  const [timeGridDate, setTimeGridDate] = useState(null);
  // Reminderのホイールを開いている下書きのID
  const [reminderWheelFor, setReminderWheelFor] = useState(null);
  // 日付に紐づかない常設タスクの入力欄
  const [pinnedDraft, setPinnedDraft] = useState("");
  const [editingEventText, setEditingEventText] = useState("");
  const [editingEventTime, setEditingEventTime] = useState("");
  const [editingEventIsAllDay, setEditingEventIsAllDay] = useState(false);
  const [eventDrafts, setEventDrafts] = useState([{ id: "d0", time: "09:00", title: "", isAllDay: false }]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const eventTitleInputRef = useRef(null);
  const taskInputRef = useRef(null);

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

  // 1回タップはその日を選ぶだけ(下のB欄で新規入力するため)。
  // 同じ日をもう一度タップ(ダブルタップ)すると C(その日のリスト)を開く。
  function selectDate(ds) {
    if (ds === selectedDate) {
      setDayDetailDate(ds);
      return;
    }
    setSelectedDate(ds);
    setTeamMemoDraft(null);
  }

  function commitTaskDraft(draftId) {
    const draft = taskDrafts.find((d) => d.id === draftId);
    if (!draft || !draft.text.trim()) return;
    if (isTeam) addTeamTaskAction(selectedDate, draft.text.trim());
    else addTask(selectedDate, draft.text.trim(), draft.reminderTime);
    setTaskDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, text: "", reminderTime: "" } : d)));
  }

  function updateTaskDraft(draftId, patch) {
    setTaskDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, ...patch } : d)));
  }

  function addTaskDraft() {
    setTaskDrafts((prev) => [...prev, { id: `t${Date.now()}`, text: "", reminderTime: "" }]);
  }

  function removeTaskDraft(draftId) {
    setTaskDrafts((prev) => (prev.length > 1 ? prev.filter((d) => d.id !== draftId) : prev));
  }

  function handleAddEvent(draftId) {
    const draft = eventDrafts.find((d) => d.id === draftId);
    if (!draft || !draft.title.trim()) return;
    const time = draft.isAllDay ? "" : draft.time;
    if (isTeam) addTeamEventAction(selectedDate, time, draft.title.trim());
    else addEvent(selectedDate, time, draft.title.trim());
    setEventDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, title: "" } : d)));
  }

  function updateEventDraft(draftId, patch) {
    setEventDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, ...patch } : d)));
  }

  function addEventDraft() {
    setEventDrafts((prev) => [...prev, { id: `d${Date.now()}`, time: "09:00", title: "", isAllDay: false }]);
  }

  function removeEventDraft(draftId) {
    setEventDrafts((prev) => (prev.length > 1 ? prev.filter((d) => d.id !== draftId) : prev));
  }

  function startEditTask(t) {
    setEditingTaskId(t.id);
    setEditingTaskText(t.title || t.text || "");
    setEditingTaskReminderTime(t.reminderTime || "");
  }

  function saveEditTask() {
    const text = editingTaskText.trim();
    const task = dayTasks.find((t) => t.id === editingTaskId);
    if (text && task) {
      if (isTeam) updateTeamTaskAction(task, text);
      else updateTask(editingTaskId, text, editingTaskReminderTime);
    }
    setEditingTaskId(null);
    setEditingTaskText("");
    setEditingTaskReminderTime("");
  }

  function cancelEditTask() {
    setEditingTaskId(null);
    setEditingTaskText("");
    setEditingTaskReminderTime("");
  }

  function startEditEvent(e) {
    setEditingEventId(e.id);
    setEditingEventText(e.title || e.text || "");
    setEditingEventTime(e.time || "");
    setEditingEventIsAllDay(!e.time);
  }

  function saveEditEvent() {
    const text = editingEventText.trim();
    const event = dayEvents.find((e) => e.id === editingEventId);
    const time = editingEventIsAllDay ? "" : editingEventTime;
    if (text && event) {
      if (isTeam) updateTeamEventAction(event, time, text);
      else updateEvent(editingEventId, time, text);
    }
    setEditingEventId(null);
    setEditingEventText("");
    setEditingEventTime("");
    setEditingEventIsAllDay(false);
  }

  function cancelEditEvent() {
    setEditingEventId(null);
    setEditingEventText("");
    setEditingEventTime("");
    setEditingEventIsAllDay(false);
  }

  function handleToggleTask(t) {
    if (isTeam) toggleTeamTaskAction(t);
    else toggleTask(t.id);
  }

  async function handleDeleteTask(id) {
    if (!(await confirm("このタスクを削除しますか？", { confirmLabel: "削除する", danger: true }))) return;
    if (isTeam) deleteTeamTaskAction(id);
    else deleteTask(id);
  }

  async function handleDeleteEvent(id) {
    if (!(await confirm("この予定を削除しますか？", { confirmLabel: "削除する", danger: true }))) return;
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
    // 送信は「移動」の意味なので、送ったメモは日付側から消す。
    clearMemo(selectedDate);
    setMemoSent(true);
    setTimeout(() => setMemoSent(false), 2000);
  }

  return (
    <div className="h-[100dvh] bg-app-bg flex flex-col">
      {/* Full Screen Scroll */}
      <main ref={mainRef} data-scroll-root className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <header className="bg-app-bg px-5 pt-6 pb-2">
          <h1 className="text-lg font-bold text-center">Dayliy Brains</h1>
        </header>
        <SpaceSwitcher />
        {/* ========= PAGE 1 ========= */}
        <section className="flex flex-col">
          {/* Month — iOS標準カレンダー風: 左寄せの大きな月表示 */}
          <div className="px-5 pt-2 pb-1 flex items-end justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[32px] leading-none font-bold text-ink">{MONTH_NAMES[calMonth.m]}</h2>
              <span className="text-sm text-ink-sub">{calMonth.y}</span>
            </div>
            <div className="flex items-center gap-4 pb-1 text-ink-sub">
              {/* A(月表示) ⇄ D(縦列) の切り替え */}
              <button
                className="p-1"
                onClick={() => setCalView((v) => (v === "month" ? "day" : "month"))}
                aria-label={calView === "month" ? "縦列表示に切替" : "月表示に切替"}
              >
                {calView === "month" ? <Rows3 size={18} /> : <CalendarDays size={18} />}
              </button>
              <button className="text-xl leading-none px-1" onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })}>{"‹"}</button>
              <button className="text-xl leading-none px-1" onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })}>{"›"}</button>
            </div>
          </div>

          {calView === "month" ? (
          <>
          {/* Week — 11pxグレー、下に髪の毛ライン */}
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-ink-sub py-1.5 border-b border-app-line/70">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>

          {/* Calendar — iOS標準風: 縦罫線なし・行ごとの髪の毛ライン・数字は中央 */}
          <div className="grid grid-cols-7" style={{ gridAutoRows: "96px" }}>
            {grid.map((d, index) => {
              const rowLine = index >= 7 ? "border-t border-app-line/70" : "";
              if (!d) return <div key={index} className={rowLine} />;
              const ds = dateOf(d);
              const isToday = ds === todayS;
              const isSelected = ds === selectedDate;
              const dow = index % 7;
              const isWeekend = dow === 0 || dow === 6;
              const items = (cellPreview[ds] || []).slice(0, 3);
              const overflowCount = (cellPreview[ds] || []).length - items.length;
              // touchAction は以前 "pan-y" だったが、これだと日付のマスの上で
              // ピンチ操作がブラウザに渡らず、カレンダーを拡大できなかった。
              // "manipulation" はピンチズームと縦スクロールを許可しつつ、
              // ダブルタップによるブラウザ拡大だけを無効にする(日付のダブルタップは
              // C画面を開く操作に使うため、この方が都合がよい)。
              return (
                <button
                  key={index}
                  onClick={() => selectDate(ds)}
                  className={`${rowLine} flex flex-col items-center justify-start pt-1.5 px-[3px] text-left bg-app-bg`}
                  style={{ touchAction: "manipulation" }}
                >
                  <span className={`inline-flex items-center justify-center w-[30px] h-[30px] rounded-full text-[17px] font-semibold leading-none mb-1 ${
                    isToday ? "bg-accent-red text-white" : isSelected ? "bg-app-raised text-ink" : isWeekend ? "text-ink-sub" : "text-ink"
                  }`}>
                    {d}
                  </span>
                  <div className="flex flex-col gap-[3px] w-full items-stretch">
                    {items.map((it, i) => {
                      const c = eventColorFor(it.title);
                      return (
                        <span
                          key={i}
                          className="flex items-center gap-1 h-[18px] rounded-full px-1.5 min-w-0"
                          style={{ backgroundColor: c + "26" }}
                        >
                          <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                          <span className={`text-[10px] font-medium truncate text-ink ${it.kind === "task" && it.completed ? "line-through opacity-60" : ""}`}>{it.title}</span>
                        </span>
                      );
                    })}
                    {overflowCount > 0 && (
                      <span className="text-[10px] text-ink-sub px-1.5">+{overflowCount}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          </>
          ) : (
            /* D: 日付が縦に並ぶリスト。A(月表示)と同列で、上部のボタンで行き来する。
               日付をタップすると E(その日の時間軸表示)を開く。 */
            <DateListView month={calMonth} onOpenDate={setTimeGridDate} />
          )}
        </section>

        {/* ========= 常設タスク =========
            日付にも月にも紐づかない、貼り付けメモのようなタスク。
            カレンダーの下に常に表示され、月を移動しても内容は変わらない。
            完了チェックは持たず、終わったら削除する運用。 */}
        <section className="px-5 pt-2 pb-5">
          <div className="space-y-1">
            {(data.pinnedTasks || []).map((t) => (
              <div key={t.id} className="flex items-center gap-2 group">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-sub shrink-0" />
                <input
                  value={t.title}
                  onChange={(e) => updatePinnedTask(t.id, e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[15px] py-1 outline-none"
                />
                <button
                  onClick={() => deletePinnedTask(t.id)}
                  className="w-9 h-9 mr-2 shrink-0 flex items-center justify-center text-ink-sub"
                  aria-label="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-sub/30 shrink-0" />
              <input
                value={pinnedDraft}
                onChange={(e) => setPinnedDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    addPinnedTask(pinnedDraft);
                    setPinnedDraft("");
                  }
                }}
                placeholder="Add..."
                className="flex-1 min-w-0 bg-transparent text-[15px] py-1 outline-none placeholder:text-ink-sub/40"
              />
              <button
                onClick={() => { addPinnedTask(pinnedDraft); setPinnedDraft(""); }}
                className="w-9 h-9 mr-2 shrink-0 flex items-center justify-center text-ink-sub"
                aria-label="Add"
              >
                <Plus size={17} />
              </button>
            </div>
          </div>
        </section>

        {/* ========= PAGE 2 ========= */}
        <section id="calendar-day-detail" className="px-5 pt-0 pb-8" style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">
              {Number(calMonth.m) + 1}/{Number(selectedDate.split("-")[2])}
            </h2>
            <button onClick={addEventDraft} className="w-9 h-9 rounded-full bg-app-raised text-ink flex items-center justify-center" aria-label="予定欄を追加">
              <Plus size={18} />
            </button>
          </div>

          {isTeam && teamError && <p className="text-xs text-red-500 mb-3">{teamError}</p>}
          {isTeam && teamLoading && <p className="text-xs text-ink-sub mb-3">同期中…</p>}

          {/* 1. Schedule */}
          <div className="space-y-3 mb-10">
            {dayEvents.map((e) => (
              <div key={e.id} className={`rounded-2xl border p-4 ${isTeam ? "border-blue-100 bg-blue-50" : ""}`}>
                {editingEventId === e.id ? (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-ink-sub">
                      <input
                        type="checkbox"
                        checked={editingEventIsAllDay}
                        onChange={(ev) => setEditingEventIsAllDay(ev.target.checked)}
                        className="w-3.5 h-3.5"
                      />
                      All day
                    </label>
                    <div className="flex items-center gap-2">
                      {!editingEventIsAllDay && (
                        <input
                          type="time"
                          value={editingEventTime}
                          onChange={(ev) => setEditingEventTime(ev.target.value)}
                          className="rounded-xl border p-2 text-sm w-28 flex-shrink-0"
                        />
                      )}
                      <input
                        autoFocus
                        value={editingEventText}
                        onChange={(ev) => setEditingEventText(ev.target.value)}
                        onKeyDown={(ev) => { if (ev.key === "Escape") { cancelEditEvent(); return; } handleEnterToConfirm(ev, saveEditEvent); }}
                        className="flex-1 outline-none border-b border-app-line text-sm"
                      />
                      <button onClick={saveEditEvent} className="flex-shrink-0 text-xs font-semibold bg-ink text-app-bg rounded-lg px-2.5 py-1">保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditEvent(e)} className="flex-1 text-left">
                      {e.time ? `${e.time}　${e.text || e.title}` : (e.text || e.title)}
                      {isTeam && <span className="block text-[10px] text-blue-500 mt-1">● {e.author || "名無し"}</span>}
                    </button>
                    <button onClick={() => handleDeleteEvent(e.id)} className="flex-shrink-0 text-ink-sub text-sm">🗑</button>
                  </div>
                )}
              </div>
            ))}
            {eventDrafts.map((draft) => (
              <div key={draft.id} className="relative rounded-2xl border p-3 pt-6">
                {eventDrafts.length > 1 && (
                  <button
                    onClick={() => removeEventDraft(draft.id)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-app-surface border border-app-line text-ink-sub flex items-center justify-center text-xs"
                    aria-label="この予定欄を削除"
                  >×</button>
                )}
                <label className="flex items-center gap-2 text-sm text-ink-sub mb-2">
                  <input
                    type="checkbox"
                    checked={draft.isAllDay}
                    onChange={(ev) => updateEventDraft(draft.id, { isAllDay: ev.target.checked })}
                    className="w-4 h-4"
                  />
                  All day
                </label>
                <div className="flex gap-2">
                  {!draft.isAllDay && (
                    <input
                      type="time"
                      value={draft.time}
                      onChange={(ev) => updateEventDraft(draft.id, { time: ev.target.value })}
                      className="rounded-2xl border p-4 w-32"
                    />
                  )}
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(ev) => updateEventDraft(draft.id, { title: ev.target.value })}
                    onKeyDown={(ev) => handleEnterToConfirm(ev, () => handleAddEvent(draft.id))}
                    placeholder="Add schedule..."
                    className="flex-1 rounded-2xl border p-4"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 2. Task */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Task</h2>
            <button onClick={addTaskDraft} className="w-9 h-9 rounded-full bg-app-raised text-ink flex items-center justify-center" aria-label="タスク欄を追加">
              <Plus size={18} />
            </button>
          </div>
          <div className="space-y-2 mb-3">
            {dayTasks.map((t) => (
              <div key={t.id} className={`flex items-center gap-2 rounded-2xl border p-4 ${isTeam ? "border-blue-100 bg-blue-50" : ""}`}>
                <button onClick={() => handleToggleTask(t)} className="flex-shrink-0 text-lg">
                  {t.completed ? "☑" : "☐"}
                </button>
                {editingTaskId === t.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="time"
                      value={editingTaskReminderTime}
                      onChange={(e) => setEditingTaskReminderTime(e.target.value)}
                      className="rounded-lg border p-1.5 text-xs w-24 flex-shrink-0"
                    />
                    <input
                      autoFocus
                      value={editingTaskText}
                      onChange={(e) => setEditingTaskText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") { cancelEditTask(); return; } handleEnterToConfirm(e, saveEditTask); }}
                      className="flex-1 outline-none border-b border-app-line"
                    />
                    <button onClick={saveEditTask} className="flex-shrink-0 text-xs font-semibold bg-ink text-app-bg rounded-lg px-2.5 py-1">保存</button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEditTask(t)}
                    className={`flex-1 text-left ${t.completed ? "text-ink-sub line-through" : ""}`}
                  >
                    {t.reminderTime && <span className="text-xs text-ink-sub mr-1.5">🔔{t.reminderTime}</span>}
                    {t.title || t.text}
                    {isTeam && <span className="block text-[10px] text-blue-500">● {t.author || "名無し"}</span>}
                  </button>
                )}
                <button onClick={() => handleDeleteTask(t.id)} className="flex-shrink-0 text-ink-sub text-sm">🗑</button>
              </div>
            ))}
          </div>
          {taskDrafts.map((draft) => (
            <div key={draft.id} className="relative rounded-2xl border p-3 pt-6 mb-3">
              {taskDrafts.length > 1 && (
                <button
                  onClick={() => removeTaskDraft(draft.id)}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-app-surface border border-app-line text-ink-sub flex items-center justify-center text-xs"
                  aria-label="このタスク欄を削除"
                >×</button>
              )}
              <textarea
                value={draft.text}
                onChange={(e) => updateTaskDraft(draft.id, { text: e.target.value })}
                onKeyDown={(e) => handleEnterToConfirm(e, () => commitTaskDraft(draft.id), { allowShiftNewline: true })}
                placeholder="Add Task..."
                className="w-full h-24 rounded-xl border p-3 mb-2"
              />
              {!isTeam && (
                // Clearボタンは <label> の外に置く。中に入れているとボタンを押した時に
                // ラベルが紐づく時刻入力にもフォーカスを渡してしまい、ピッカーが開いて
                // 現在時刻が表示されるため「クリアしても変わらない」ように見えていた。
                <div className="flex items-center gap-2 text-sm text-ink-sub">
                  <span>Reminder</span>
                  {/* 自前のホイールを使う。input[type=time] は未設定のとき
                      現在時刻を表示してしまうため。 */}
                  <button
                    onClick={() => setReminderWheelFor(draft.id)}
                    className={`rounded-xl border border-app-line px-3 py-2 text-sm tabular-nums ${
                      draft.reminderTime ? "text-ink" : "text-ink-sub/50"
                    }`}
                  >
                    {draft.reminderTime || "--:--"}
                  </button>
                  {draft.reminderTime && (
                    <button
                      onClick={() => updateTaskDraft(draft.id, { reminderTime: "" })}
                      className="text-[15px] leading-none text-ink-sub w-7 h-7 flex items-center justify-center"
                      aria-label="Clear"
                    >
                      ×
                    </button>
                  )}
                  {reminderWheelFor === draft.id && (
                    <TimeWheel
                      value={draft.reminderTime}
                      onChange={(v) => updateTaskDraft(draft.id, { reminderTime: v })}
                      onClose={() => setReminderWheelFor(null)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 3. Memo */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-semibold">Memo</h2>
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="w-9 h-9 rounded-full border bg-app-surface flex items-center justify-center">
                {uploadingFile ? "…" : <Paperclip size={16} />}
              </button>
              <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="w-9 h-9 rounded-full border bg-app-surface flex items-center justify-center">
                {uploadingPhoto ? "…" : <Camera size={16} />}
              </button>
              <button
                onClick={handleSendMemoToNote}
                disabled={!memoText.trim() && memo.images.length === 0 && memo.files.length === 0}
                className="h-9 px-3 rounded-full border border-app-line bg-app-surface text-xs font-semibold flex items-center gap-1 disabled:opacity-30"
              >
                <PencilLine size={14} />
                {memoSent ? "済" : "to note"}
              </button>
            </div>
          </div>
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
                  <MediaImg src={src} alt="" className="w-20 h-20 object-cover rounded-xl border" />
                  <button onClick={() => (isTeam ? removeTeamMemoImageAction(selectedDate, i) : removeMemoImage(selectedDate, i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-app-bg text-xs flex items-center justify-center">×</button>
                </div>
              ))}
            </div>
          )}
          {memo.files.length > 0 && (
            <div className="space-y-2 mb-3">
              {memo.files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                  <span className="truncate flex items-center gap-1.5"><FileText size={13} className="shrink-0" /> {f.name}</span>
                  <button onClick={() => (isTeam ? removeTeamMemoFileAction(selectedDate, i) : removeMemoFile(selectedDate, i))} className="text-ink-sub ml-2">×</button>
                </div>
              ))}
            </div>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePickPhoto} className="hidden" />
          <input ref={fileInputRef} type="file" multiple onChange={handlePickFile} className="hidden" />
        </section>
      </main>

      <BottomNavigation current="calendar" setTab={setTab} />

      {dayDetailDate && (
        <DayDetailScreen date={dayDetailDate} onClose={() => setDayDetailDate(null)} />
      )}

      {timeGridDate && (
        <TimeGridScreen date={timeGridDate} onClose={() => setTimeGridDate(null)} />
      )}
    </div>
  );
}
