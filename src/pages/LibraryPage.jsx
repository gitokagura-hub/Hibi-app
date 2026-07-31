import { useMemo, useState, useEffect, useRef } from "react";
import { ChevronLeft, Image as ImageIcon, Tag } from "lucide-react";
import { useData } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";

// Library-only tagging & captions: kept entirely separate from
// Notes/Calendar/Projects data so this can never affect those screens.
// Keyed by the image's src (the data URL itself acts as a stable
// identifier for a given photo).
const TAGS_KEY = "hibi-library-tags"; // { [src]: string[] }
const CATEGORIES_KEY = "hibi-library-categories"; // string[]
const COMMENTS_KEY = "hibi-library-comments"; // { [src]: string }

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
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
        <button
          onClick={() => {
            const trimmed = newCat.trim();
            if (trimmed) {
              onAddCategory(trimmed);
              onSave(picked.includes(trimmed) ? picked : [...picked, trimmed]);
            } else {
              onSave(picked);
            }
          }}
          className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold mb-2"
        >保存</button>
        <button onClick={onClose} className="w-full text-center text-gray-400 text-sm">キャンセル</button>
      </div>
    </div>
  );
}

// Fullscreen photo viewer for one section's photo list. Swipe left/right
// (or use the arrow buttons) to move through the same list the photo was
// opened from. Includes a one-line comment field for the current photo.
function PhotoViewer({ list, startIndex, comments, onSaveComment, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [draft, setDraft] = useState(comments[list[startIndex]?.src] || "");
  const touchStartX = useRef(null);
  const current = list[index];

  useEffect(() => {
    setDraft(comments[current?.src] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function commitDraft() {
    if (current && draft !== (comments[current.src] || "")) onSaveComment(current.src, draft);
  }
  function goTo(newIndex) {
    commitDraft();
    if (newIndex >= 0 && newIndex < list.length) setIndex(newIndex);
  }
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(index + 1); // swiped left -> next
    else goTo(index - 1); // swiped right -> previous
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/95 flex flex-col items-center justify-center p-8"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img src={current.src} alt="" className="max-w-full max-h-[70vh] object-contain rounded-2xl" />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        placeholder="コメントを追加..."
        className="mt-4 w-full max-w-sm rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/20 px-4 py-2.5 text-sm text-center"
      />
      {list.length > 1 && (
        <p className="mt-3 text-white/50 text-xs">{index + 1} / {list.length}</p>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); commitDraft(); onClose(); }}
        className="absolute top-14 right-5 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center"
      >×</button>
    </div>
  );
}

export default function LibraryPage({ onHome }) {
  useSwipeBack(onHome);
  const { data } = useData();
  const [viewer, setViewer] = useState(null); // { list, startIndex }
  const [tagMap, setTagMap] = useState(() => loadJSON(TAGS_KEY, {}));
  const [categories, setCategories] = useState(() => loadJSON(CATEGORIES_KEY, []));
  const [comments, setComments] = useState(() => loadJSON(COMMENTS_KEY, {}));
  const [taggingSrc, setTaggingSrc] = useState(null);

  useEffect(() => { saveJSON(TAGS_KEY, tagMap); }, [tagMap]);
  useEffect(() => { saveJSON(CATEGORIES_KEY, categories); }, [categories]);
  useEffect(() => { saveJSON(COMMENTS_KEY, comments); }, [comments]);

  function addCategory(name) {
    setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }
  function saveTagsFor(src, tags) {
    setTagMap((prev) => ({ ...prev, [src]: tags }));
    setTaggingSrc(null);
  }
  function saveCommentFor(src, text) {
    setComments((prev) => ({ ...prev, [src]: text }));
  }

  // Daily Brains内の3つの保存場所（Notes / Calendar memos / Projects）を横断して画像を集約
  const images = useMemo(() => {
    const items = [];

    (data?.notes || []).forEach((n) =>
      (n.images || []).forEach((src) =>
        items.push({ src, source: "Notes", createdAt: n.createdAt })
      )
    );

    Object.entries(data?.memos || {}).forEach(([date, memo]) =>
      (memo.images || []).forEach((src) =>
        items.push({ src, source: `Calendar / ${date}`, createdAt: new Date(date).getTime() })
      )
    );

    (data?.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.images || []).forEach((src) =>
          items.push({ src, source: `Projects / ${p.name}`, createdAt: it.createdAt })
        )
      )
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  const imagesWithTags = images.map((img) => ({ ...img, tags: tagMap[img.src] || [] }));
  const untagged = imagesWithTags.filter((img) => img.tags.length === 0);

  function PhotoGrid({ list }) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {list.map((img, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <button
              onClick={() => setViewer({ list, startIndex: i })}
              className="w-full h-full block"
              title={img.source}
            >
              <img src={img.src} alt={img.source} className="w-full h-full object-cover" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setTaggingSrc(img.src); }}
              className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full bg-white/40 backdrop-blur-sm border border-white/60 flex items-center justify-center"
              aria-label="タグを編集"
            >
              <Tag size={15} className="text-white drop-shadow" />
            </button>
          </div>
        ))}
      </div>
    );
  }

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
          {images.length}件の画像（Daily Brains内 / Notes・Calendar・Projects横断）
        </p>
      </header>

      <main className="px-5 pb-24">
        {images.length === 0 ? (
          <div className="mt-20 flex flex-col items-center text-center text-gray-400">
            <ImageIcon size={32} />
            <p className="mt-3 text-sm">まだ画像がありません</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              const list = imagesWithTags.filter((img) => img.tags.includes(cat));
              if (list.length === 0) return null;
              return (
                <div key={cat}>
                  <h2 className="text-lg font-semibold mb-2">{cat}</h2>
                  <PhotoGrid list={list} />
                </div>
              );
            })}
            {untagged.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-2 text-gray-400">未分類</h2>
                <PhotoGrid list={untagged} />
              </div>
            )}
          </div>
        )}
      </main>

      {viewer && (
        <PhotoViewer
          list={viewer.list}
          startIndex={viewer.startIndex}
          comments={comments}
          onSaveComment={saveCommentFor}
          onClose={() => setViewer(null)}
        />
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
