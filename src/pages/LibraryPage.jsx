import { useMemo, useState } from "react";
import { ChevronLeft, Image as ImageIcon } from "lucide-react";
import { useData } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";

// Images are stored either as plain strings (older data) or as
// { src, categories } objects (after the category feature was added).
// Normalize both shapes to { src, categories } here.
function normalizeImage(img) {
  if (img && typeof img === "object") return { src: img.src, categories: img.categories || [] };
  return { src: img, categories: [] };
}

export default function LibraryPage({ onHome }) {
  useSwipeBack(onHome);
  const { data } = useData();
  const [viewerSrc, setViewerSrc] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null); // null = すべて

  // Daily Brains内の3つの保存場所（Notes / Calendar memos / Projects）を横断して画像を集約
  const images = useMemo(() => {
    const items = [];

    (data.notes || []).forEach((n) =>
      (n.images || []).forEach((img) =>
        items.push({ ...normalizeImage(img), source: "Notes", createdAt: n.createdAt })
      )
    );

    Object.entries(data.memos || {}).forEach(([date, memo]) =>
      (memo.images || []).forEach((img) =>
        items.push({ ...normalizeImage(img), source: `Calendar / ${date}`, createdAt: new Date(date).getTime() })
      )
    );

    (data.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.images || []).forEach((img) =>
          items.push({ ...normalizeImage(img), source: `Projects / ${p.name}`, createdAt: it.createdAt })
        )
      )
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  const filteredImages = activeCategory
    ? images.filter((img) => img.categories.includes(activeCategory))
    : images;

  const uncategorizedCount = images.filter((img) => img.categories.length === 0).length;

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

      {data.settings.photoCategories.length > 0 && (
        <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border ${!activeCategory ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}
          >
            すべて
          </button>
          {data.settings.photoCategories.map((cat) => (
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
            <p className="mt-3 text-sm">{activeCategory ? "このカテゴリーの画像はまだありません" : "まだ画像がありません"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setViewerSrc(img.src)}
                className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                title={img.source}
              >
                <img src={img.src} alt={img.source} className="w-full h-full object-cover" />
                {img.categories.length > 0 && (
                  <span className="absolute bottom-1 left-1 right-1 truncate rounded-full bg-black/60 text-white text-[9px] px-1.5 py-0.5">
                    {img.categories.join(" / ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {!activeCategory && uncategorizedCount > 0 && (
          <p className="mt-4 text-xs text-gray-400 text-center">未分類の写真: {uncategorizedCount}件</p>
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
    </div>
  );
}
