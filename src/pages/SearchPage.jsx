import { useState, useMemo } from "react";
import { Layout } from "../components";
import { useData } from "../dataStore";

export default function SearchPage({ setTab }) {
  const { data } = useData();
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    if (!q.trim()) return null;
    const ql = q.trim().toLowerCase();
    const eventHits = data.events.filter((e) => e.title.toLowerCase().includes(ql)).map((e) => ({ type: "Calendar", label: `${e.time}　${e.title}` }));
    const taskHits = data.tasks.filter((t) => t.title.toLowerCase().includes(ql)).map((t) => ({ type: "Calendar", label: t.title }));
    const noteHits = data.notes.filter((n) => n.text.toLowerCase().includes(ql)).map((n) => ({ type: "Note", label: n.text }));
    const projectHits = data.projects.filter((p) => p.name.toLowerCase().includes(ql)).map((p) => ({ type: "Project", label: p.name }));
    const roomItemHits = data.projects.flatMap((p) => p.items.filter((it) => it.text.toLowerCase().includes(ql)).map((it) => ({ type: `Project: ${p.name}`, label: it.text })));
    return [...eventHits, ...taskHits, ...noteHits, ...projectHits, ...roomItemHits];
  }, [q, data]);

  return (
    <Layout title="Search" current="search" setTab={setTab}>
      <div className="px-5">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search..."
          className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none"
        />

        <div className="mt-6 space-y-3">
          {results && results.length === 0 && (
            <p className="text-gray-400">No results</p>
          )}
          {results && results.map((r, i) => (
            <button key={i} className="w-full rounded-2xl border border-gray-200 p-4 text-left">
              <span className="text-xs text-gray-400 block mb-1">{r.type}</span>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}
