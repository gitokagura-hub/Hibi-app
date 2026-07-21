import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, Image as ImageIcon } from "lucide-react";
import { useData } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";

// Library-only tagging: kept entirely separate from Notes/Calendar/Projects
// data so tagging can never affect those screens. Keyed by the image's src
// (the data URL itself acts as a stable identifier for a given photo).
const TAGS_KEY = "hibi-library-tags"; // { [src]: string[] }
const CATEGORIES_KEY = "hibi-library-categories"; // string[]

function loadTagMap() {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveTagMap(map) {
  try { localStorage.setItem(TAGS_KEY, JSON.stringify(map)); } catch {}
}
function loadCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveCategories(list) {
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list)); } catch {}
}

// Bottom sheet for picking (multiple) categories for one photo, and for
// creating brand-new category names on the spot.
function TagPickerSheet({ selected, available, onAddCategory, onClose, onSave }) {
  const [picked, setPicked] = useState(selected);
  const [newCat, setNewCat] = useState("");

  function toggle(cat) {
    setPicked((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }
  function handleAddNew() {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    onAddCategory(trimmed);
    setPicked((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setNewCat("");
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end bg-black/40" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <h2 className="text-lg font-semibold mb-3">🏷️ タグを選ぶ</h2>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {available.map((cat) => (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={`rounded-full px-4 py-2 text-sm font-semibold border ${picked.includes(cat) ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 mb-5">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddNew(); }}
            placeholder="新しいタグ名（例：人、料理、名刺）..."
            className="flex-1 rounded-xl border p-2.5 text-sm"
          />
          <button onClick={handleAddNew} disabled={!newCat.trim()} className="rounded-xl bg-black text-white px-4 text-sm font-semibold disabled:opacity-30">追加</button>
        </div>
        <button onClick={() => onSave(picked)} className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold mb-2">保存</button>
        <button onClick={onClose} className="w-full text-center text-gray-400 text-sm">キャンセル</button>
      </div>
    </div>
  );
}

export default function LibraryPage({ onHome }) {
  useSwipeBack(onHome);
  const { data } = useData();
  const [viewerSrc, setViewerSrc] = useState(null);
  const [tagMap, setTagMap] = useState(() => loadTagMap());
  const [categories, setCategories] = useState(() => loadCategories());
  const [activeCategory, setActiveCategory] = useState(null); // null = すべて
  const [taggingSrc, setTaggingSrc] = useState(null);

  useEffect(() => { saveTagMap(tagMap); }, [tagMap]);
  useEffect(() => { saveCategories(categories); }, [categories]);

  function addCategory(name) {
    setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }
  function saveTagsFor(src, tags) {
    setTagMap((prev) => ({ ...prev, [src]: tags }));
    setTaggingSrc(null);
  }

  // Daily Brains内の3つの保存場所（Notes / Calendar memos / Projects）を横断して画像を集約
  const images = useMemo(() => {
    const items = [];

    (data.notes || []).forEach((n) =>
      (n.images || []).forEach((src) =>
        items.push({ src, source: "Notes", createdAt: n.createdAt })
      )
    );

    Object.entries(data.memos || {}).forEach(([date, memo]) =>
      (memo.images || []).forEach((src) =>
        items.push({ src, source: `Calendar / ${date}`, createdAt: new Date(date).getTime() })
      )
    );

    (data.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.images || []).forEach((src) =>
          items.push({ src, source: `Projects / ${p.name}`, createdAt: it.createdAt })
        )
      )
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  const imagesWithTags = images.map((img) => ({ ...img, tags: tagMap[img.src] || [] }));
  const filteredImages = activeCategory
    ? imagesWithTags.filter((img) => img.tags.includes(activeCategory))
    : imagesWithTags;
  const untaggedCount = imagesWithTags.filter((img) => img.tags.length === 0).length;

  return (
    <div className="min-h-screen bg-white relative">
      <button
        onClick={onHome}
        className="fixed bottom-6 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          {filteredImages.length}件の画像（Daily Brains内 / Notes・Calendar・Projects横断）
        </p>
      </header>

      {categories.length > 0 && (
        <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border ${!activeCategory ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border ${activeCategory === cat ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <main className="px-5 pb-24">
        {filteredImages.length === 0 ? (
          <div className="mt-20 flex flex-col items-center text-center text-gray-400">
            <ImageIcon size={32} />
            <p className="mt-3 text-sm">{activeCategory ? "このタグの画像はまだありません" : "まだ画像がありません"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredImages.map((img, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <button
                  onClick={() => setViewerSrc(img.src)}
                  className="w-full h-full block"
                  title={img.source}
                >
                  <img src={img.src} alt={img.source} className="w-full h-full object-cover" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setTaggingSrc(img.src); }}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                >🏷️</button>
                {img.tags.length > 0 && (
                  <span className="absolute bottom-1 left-1 max-w-[65%] truncate rounded-full bg-black/60 text-white text-[9px] px-1.5 py-0.5">
                    {img.tags.join(" / ")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {!activeCategory && untaggedCount > 0 && (
          <p className="mt-4 text-xs text-gray-400 text-center">未分類の写真: {untaggedCount}件</p>
        )}
      </main>

      {viewerSrc && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
          <img src={viewerSrc} alt="" className="max-w-full max-h-full object-contain rounded-2xl" />
          <button
            onClick={(e) => { e.stopPropagation(); setViewerSrc(null); }}
            className="absolute top-14 right-5 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center"
          >×</button>
        </div>
      )}

      {taggingSrc && (
        <TagPickerSheet
          selected={tagMap[taggingSrc] || []}
          available={categories}
          onAddCategory={addCategory}
          onClose={() => setTaggingSrc(null)}
          onSave={(tags) => saveTagsFor(taggingSrc, tags)}
        />
      )}
    </div>
  );
}
