import { useState, useMemo } from "react";
import { ChevronLeft, Plus, X } from "lucide-react";
import { useTimeless, CATEGORIES, STATUS } from "../timelessStore";

const STATUS_STYLE = {
  draft: "bg-amber-50 text-amber-800",
  done: "bg-emerald-50 text-emerald-700",
};

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function ArticleCard({ article, onClick, showDate }) {
  const cat = CATEGORIES.find((c) => c.id === article.category);
  const status = STATUS.find((s) => s.id === article.status);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-200 border-l-4 p-4 active:scale-[0.98] transition-transform"
      style={{ borderLeftColor: "#8C6B47" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
          {cat?.label}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[article.status]}`}>
          {status?.label}
        </span>
        {showDate && (
          <span className="text-[10px] text-gray-400 ml-auto font-mono">{formatDate(article.createdAt)}</span>
        )}
      </div>
      <div className="text-[15px] font-bold text-gray-900 leading-snug">{article.title}</div>
      {article.content && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{article.content}</div>
      )}
    </button>
  );
}

function AddSheet({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">新しい記事アイデア</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="記事タイトル"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] focus:outline-none"
          style={{ borderColor: title ? "#8C6B47" : undefined }}
        />
        <div className="flex gap-1.5 flex-wrap mt-3">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-full border"
              style={
                category === c.id
                  ? { background: "#8C6B47", color: "#fff", borderColor: "#8C6B47" }
                  : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          disabled={!title.trim()}
          onClick={() => onCreate(title.trim(), category)}
          className="w-full mt-4 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl py-3 text-[15px]"
          style={{ background: title.trim() ? "#8C6B47" : undefined }}
        >
          作成する
        </button>
      </div>
    </div>
  );
}

export default function TimelessListPage({ onHome, onOpenArticle }) {
  const { articles, addArticle } = useTimeless();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState("category"); // "category" | "timeline"
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    let list = articles.filter(
      (a) => viewMode === "timeline" || categoryFilter === "all" || a.category === categoryFilter
    );
    list = list.sort((a, b) =>
      viewMode === "timeline" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt
    );
    return list;
  }, [articles, categoryFilter, viewMode]);

  function handleCreate(title, category) {
    const id = addArticle(title, category);
    setShowAdd(false);
    onOpenArticle(id);
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
        <h1 className="text-3xl font-semibold tracking-tight">Timeless Analogue</h1>
        <p className="mt-1 text-sm text-gray-500">構想・下書きワークスペース（非公開）</p>
      </header>

      {/* カテゴリ別 / 時系列 切り替え */}
      <div className="px-5 mb-3">
        <div className="flex bg-gray-100 rounded-xl p-1">
          {[
            { id: "category", label: "カテゴリ別" },
            { id: "timeline", label: "時系列" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={
                viewMode === v.id
                  ? { background: "#fff", color: "#1a1a1a", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }
                  : { color: "#9ca3af" }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "category" && (
        <div className="px-5 flex gap-1.5 mb-4 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter("all")}
            className="text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 border"
            style={
              categoryFilter === "all"
                ? { background: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" }
                : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
            }
          >
            すべて
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className="text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 border"
              style={
                categoryFilter === c.id
                  ? { background: "#8C6B47", color: "#fff", borderColor: "#8C6B47" }
                  : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <main className="px-5 pb-28">
        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-gray-400">
            <p className="text-sm">まだ記事がありません</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                onClick={() => onOpenArticle(a.id)}
                showDate={viewMode === "timeline"}
              />
            ))}
          </div>
        )}
      </main>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed right-5 bottom-8 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-lg z-30"
        style={{ background: "#8C6B47" }}
        aria-label="新規作成"
      >
        <Plus size={24} />
      </button>

      {showAdd && <AddSheet onClose={() => setShowAdd(false)} onCreate={handleCreate} />}
    </div>
  );
}
