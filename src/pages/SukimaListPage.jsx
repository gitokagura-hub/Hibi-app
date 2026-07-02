import { useState, useMemo } from "react";
import { ChevronLeft, Search, Plus, X } from "lucide-react";
import { useSukima } from "../sukimaStore";

const STATUS_LABEL = { draft: "下書き", investigating: "調査中", done: "完了" };
const STATUS_STYLE = {
  draft: "bg-gray-100 text-gray-500",
  investigating: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
};

function EntryCard({ entry, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
    >
      <div
        className={`w-11 h-11 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm ${
          entry.type === "company" ? "rounded-xl" : "rounded-full"
        }`}
        style={{
          background:
            entry.type === "company"
              ? "linear-gradient(135deg,#279a63,#1c7a4d)"
              : "linear-gradient(135deg,#8E8E93,#48484A)",
        }}
      >
        {entry.name ? entry.name.slice(0, 2) : "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-gray-900 truncate">
            {entry.name || "無題の研究"}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLE[entry.status]}`}>
            {STATUS_LABEL[entry.status]}
          </span>
        </div>
        {entry.role && <div className="text-xs text-gray-500 mt-0.5 truncate">{entry.role}</div>}
        {entry.tags?.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {entry.tags.slice(0, 3).map((t, i) => (
              <span key={i} className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronLeft size={16} className="text-gray-300 rotate-180 flex-shrink-0" />
    </button>
  );
}

function AddSheet({ type, onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-3xl p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">
            新しい{type === "person" ? "人物" : "企業"}研究
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "person" ? "例: 小澤氏" : "例: DOTCON株式会社"}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-emerald-500"
        />
        <button
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim())}
          className="w-full mt-4 bg-emerald-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl py-3 text-[15px]"
        >
          作成してリサーチを始める
        </button>
      </div>
    </div>
  );
}

export default function SukimaListPage({ onHome, onOpenEntry }) {
  const { entries, addEntry } = useSukima();
  const [type, setType] = useState("person"); // "person" | "company"
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => e.type === type)
      .filter((e) => statusFilter === "all" || e.status === statusFilter)
      .filter((e) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          e.name.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [entries, type, statusFilter, query]);

  function handleCreate(name) {
    const id = addEntry(type, name);
    setShowAdd(false);
    onOpenEntry(id);
  }

  return (
    <div className="min-h-screen bg-white relative">
      <button
        onClick={onHome}
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">Sukima</h1>
        <p className="mt-1 text-sm text-gray-500">人物・企業を研究し、隙間を見つける</p>
      </header>

      {/* 人物 / 企業 タブ */}
      <div className="px-5 flex gap-2 mb-3">
        {[
          { id: "person", label: "人物" },
          { id: "company", label: "企業" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              type === t.id ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="px-5 mb-3">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
          <Search size={15} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・タグで検索"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* ステータスフィルタ */}
      <div className="px-5 flex gap-1.5 mb-4 overflow-x-auto">
        {[
          { id: "all", label: "すべて" },
          { id: "draft", label: "下書き" },
          { id: "investigating", label: "調査中" },
          { id: "done", label: "完了" },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 border ${
              statusFilter === s.id
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      <main className="px-5 pb-28">
        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-gray-400">
            <p className="text-sm">
              {type === "person" ? "まだ人物研究がありません" : "まだ企業研究がありません"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((e) => (
              <EntryCard key={e.id} entry={e} onClick={() => onOpenEntry(e.id)} />
            ))}
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed right-5 bottom-8 w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg z-30"
        aria-label="新規作成"
      >
        <Plus size={24} />
      </button>

      {showAdd && (
        <AddSheet type={type} onClose={() => setShowAdd(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
