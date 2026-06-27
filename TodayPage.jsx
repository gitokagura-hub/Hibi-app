import { Layout } from "../components";
import { useData, todayStr } from "../dataStore";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatToday() {
  const d = new Date();
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export default function TodayPage({ setTab }) {
  const { data, toggleTask, setMemo } = useData();
  const today = todayStr();
  const tasks = data.tasks.filter((t) => t.date === today);
  const memoText = data.memos[today] || "";

  return (
    <Layout title="Today" subtitle={formatToday()} current="today" setTab={setTab}>
      {/* Today's Tasks */}
      <section className="px-5 mb-8">
        <h2 className="text-lg font-semibold mb-4">Today's Tasks</h2>

        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="rounded-2xl border p-4 text-gray-400">
              No tasks yet
            </div>
          )}
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTask(t.id)}
              className={`w-full text-left rounded-2xl border p-4 ${t.completed ? "text-gray-400 line-through" : ""}`}
            >
              {t.title}
            </button>
          ))}
        </div>
      </section>

      {/* Today's Memo */}
      <section className="px-5">
        <h2 className="text-lg font-semibold mb-4">Memo</h2>

        <textarea
          value={memoText}
          onChange={(e) => setMemo(today, e.target.value)}
          placeholder="Add Memo..."
          className="rounded-2xl border p-4 h-40 w-full"
        />
      </section>
    </Layout>
  );
}
