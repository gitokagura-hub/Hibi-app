import { useState, useMemo } from "react";
import { FileText } from "lucide-react";
import { Layout } from "../components";
import { useData } from "../dataStore";

export default function SearchPage({ setTab }) {
  const { data } = useData();
  const [q, setQ] = useState("");

  // 全ファイル(Notes/Calendarメモ/Projectsのメモ)を横断的に集約する。
  // Libraryの写真集約と同じパターン。
  const allFiles = useMemo(() => {
    const items = [];

    (data.notes || []).forEach((n) =>
      (n.files || []).forEach((f) =>
        items.push({ ...f, source: "Notes", createdAt: n.createdAt })
      )
    );

    Object.entries(data.memos || {}).forEach(([date, memo]) =>
      (memo.files || []).forEach((f) =>
        items.push({ ...f, source: `Calendar / ${date}`, createdAt: new Date(date).getTime() })
      )
    );

    (data.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.files || []).forEach((f) =>
          items.push({ ...f, source: `Projects / ${p.name}`, createdAt: it.createdAt })
        )
      )
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  const results = useMemo(() => {
    if (!q.trim()) return allFiles;
    const ql = q.trim().toLowerCase();
    return allFiles.filter((f) => (f.name || "").toLowerCase().includes(ql));
  }, [q, allFiles]);

  return (
    <Layout title="Search" current="search" setTab={setTab}>
      <div className="px-5">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ファイル名で検索..."
          className="w-full rounded-2xl border border-app-line px-4 py-3 outline-none"
        />

        <div className="mt-6 space-y-2">
          {results.length === 0 && (
            <p className="text-ink-sub text-sm">{q.trim() ? "見つかりませんでした" : "まだファイルがありません"}</p>
          )}
          {results.map((f, i) => (
            <a
              key={i}
              href={f.dataUrl}
              download={f.name}
              className="flex items-center gap-3 w-full rounded-2xl border border-app-line p-4 text-left"
            >
              <FileText size={20} className="text-ink-sub shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm">{f.name}</div>
                <div className="text-xs text-ink-sub">{f.source}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </Layout>
  );
}
