import { useMemo, useState, useEffect, useRef } from "react";
import { ChevronLeft, Image as ImageIcon, Plus, Camera, Tag } from "lucide-react";
import { useData, fileToCompressedDataUrl } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";

// Library-only tagging: kept entirely separate from Notes/Calendar/Projects
// data so tagging can never affect those screens. Keyed by the image's src
// (the data URL itself acts as a stable identifier for a given photo).
const TAGS_KEY = "hibi-library-tags"; // { [src]: string[] }
const CATEGORIES_KEY = "hibi-library-categories"; // string[]
const COMMENTS_KEY = "hibi-library-comments"; // { [src]: string }

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
function loadCommentMap() {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveCommentMap(map) {
  try { localStorage.setItem(COMMENTS_KEY, JSON.stringify(map)); } catch {}
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
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-app-surface rounded-t-3xl p-6 max-h-[75vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-1.5"><Tag size={17} /> タグを選ぶ</h2>
        {available.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {available.map((cat) => (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={`rounded-full px-4 py-2 text-sm font-semibold border ${picked.includes(cat) ? "bg-ink text-app-bg border-black" : "bg-app-surface text-ink-sub border-app-line"}`}
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
          <button onClick={handleAddNew} disabled={!newCat.trim()} className="rounded-xl bg-ink text-app-bg px-4 text-sm font-semibold disabled:opacity-30">追加</button>
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
          className="w-full rounded-2xl bg-ink text-app-bg p-3.5 font-semibold mb-2"
        >保存</button>
        <button onClick={onClose} className="w-full text-center text-ink-sub text-sm">キャンセル</button>
      </div>
    </div>
  );
}

export default function LibraryPage({ onHome }) {
  useSwipeBack(onHome);
  const { data, addLibraryPhotos, deleteLibraryPhoto } = useData();
  const [viewerIndex, setViewerIndex] = useState(null);
  const [tagMap, setTagMap] = useState(() => loadTagMap());
  const [commentMap, setCommentMap] = useState(() => loadCommentMap());
  const [categories, setCategories] = useState(() => loadCategories());
  const [activeCategory, setActiveCategory] = useState(null); // null = すべて
  const [taggingSrc, setTaggingSrc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => { saveTagMap(tagMap); }, [tagMap]);
  useEffect(() => { saveCommentMap(commentMap); }, [commentMap]);
  useEffect(() => { saveCategories(categories); }, [categories]);

  async function handlePickFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setAddMenuOpen(false);
    if (!files.length) return;
    setUploading(true);
    try {
      const srcs = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      addLibraryPhotos(srcs);
    } catch {
      // 圧縮/読み込みに失敗したファイルは無視して残りを続行できるよう、
      // 個別のcatchはfileToCompressedDataUrl内で処理済み想定。
    } finally {
      setUploading(false);
    }
  }

  // タグ付けシートを開く前に、写真をピンチズームで拡大表示していた
  // 場合でも等倍に戻す。iOS Safariはこのような「一瞬viewportの
  // 拡大許可を切ってから戻す」操作で、現在のズーム状態を強制的に
  // リセットできる。
  function resetViewportZoom() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute("content");
    meta.setAttribute("content", `${original}, maximum-scale=1.0`);
    setTimeout(() => meta.setAttribute("content", original), 50);
  }

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

    (data.libraryPhotos || []).forEach((p) =>
      items.push({ src: p.src, source: "Photos", createdAt: p.createdAt, libraryPhotoId: p.id })
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  const imagesWithTags = images.map((img) => ({ ...img, tags: tagMap[img.src] || [] }));
  const filteredImages = activeCategory
    ? imagesWithTags.filter((img) => img.tags.includes(activeCategory))
    : imagesWithTags;
  const untaggedCount = imagesWithTags.filter((img) => img.tags.length === 0).length;

  return (
    <div className="min-h-screen bg-app-bg relative">
      <button
        onClick={onHome}
        className="fixed bottom-6 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Photos</h1>
        </div>
        <div className="relative shrink-0 mt-1">
          <button
            onClick={() => setAddMenuOpen((v) => !v)}
            disabled={uploading}
            className="w-10 h-10 rounded-full bg-ink text-app-bg flex items-center justify-center disabled:opacity-40"
            aria-label="写真を追加"
          >
            <Plus size={20} />
          </button>
          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setAddMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-30 w-48 bg-app-surface border border-app-line rounded-2xl overflow-hidden shadow-lg">
                <button
                  onClick={() => { setAddMenuOpen(false); cameraInputRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-4 text-base font-medium text-left"
                >
                  <Camera size={22} /> 写真を撮る
                </button>
                <div className="h-px bg-app-line" />
                <button
                  onClick={() => { setAddMenuOpen(false); galleryInputRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-4 py-4 text-base font-medium text-left"
                >
                  <ImageIcon size={22} /> 写真を選ぶ
                </button>
              </div>
            </>
          )}
        </div>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePickFiles} className="hidden" />
        <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handlePickFiles} className="hidden" />
      </header>

      {categories.length > 0 && (
        <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border ${!activeCategory ? "bg-ink text-app-bg border-black" : "bg-app-surface text-ink-sub border-app-line"}`}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold border ${activeCategory === cat ? "bg-ink text-app-bg border-black" : "bg-app-surface text-ink-sub border-app-line"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <main className="px-5 pb-24">
        {filteredImages.length === 0 ? (
          <div className="mt-20 flex flex-col items-center text-center text-ink-sub">
            <ImageIcon size={32} />
            <p className="mt-3 text-sm">{activeCategory ? "このタグの画像はまだありません" : "まだ画像がありません"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredImages.map((img, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-app-raised">
                <button
                  onClick={() => setViewerIndex(i)}
                  className="w-full h-full block"
                  title={img.source}
                >
                  <img src={img.src} alt={img.source} className="w-full h-full object-cover" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); resetViewportZoom(); setTaggingSrc(img.src); }}
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                ><Tag size={12} /></button>
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
          <p className="mt-4 text-xs text-ink-sub text-center">未分類の写真: {untaggedCount}件</p>
        )}
      </main>

      {viewerIndex !== null && (
        <PhotoViewerModal
          images={filteredImages}
          index={viewerIndex}
          setIndex={setViewerIndex}
          commentMap={commentMap}
          setCommentMap={setCommentMap}
          deleteLibraryPhoto={deleteLibraryPhoto}
          onClose={() => setViewerIndex(null)}
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

function PhotoViewerModal({ images, index, setIndex, commentMap, setCommentMap, deleteLibraryPhoto, onClose }) {
  const containerRef = useRef(null);
  const stripRef = useRef(null);
  const swipe = useRef(null); // { startX, startY, lastX, lastT, v, dragging, finalDragX }
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);

  const current = images[index];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = window.innerWidth;

    function setStripX(x, withTransition) {
      const strip = stripRef.current;
      if (!strip) return;
      strip.style.transition = withTransition ? "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      strip.style.transform = `translate3d(${x}px,0,0)`;
    }

    function handleTouchStart(e) {
      if (e.touches.length !== 1) return;
      const now = performance.now();
      swipe.current = {
        startX: e.touches[0].clientX, startY: e.touches[0].clientY,
        lastX: e.touches[0].clientX, lastT: now, v: 0, dragging: false, finalDragX: 0,
      };
    }

    function handleTouchMove(e) {
      const s = swipe.current;
      if (!s || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const dx = x - s.startX;
      const dy = e.touches[0].clientY - s.startY;
      if (!s.dragging && Math.abs(dx) < Math.abs(dy) + 10) return;
      s.dragging = true;
      e.preventDefault();

      let dragX = dx;
      if ((indexRef.current === 0 && dx > 0) || (indexRef.current === images.length - 1 && dx < 0)) {
        dragX = dx * 0.35;
      }

      const now = performance.now();
      const dt = now - s.lastT;
      if (dt > 0) s.v = (x - s.lastX) / dt;
      s.lastX = x;
      s.lastT = now;
      s.finalDragX = dragX;

      setStripX(dragX, false);
    }

    function handleTouchEnd() {
      const s = swipe.current;
      if (!s || !s.dragging) { swipe.current = null; return; }

      const dragX = s.finalDragX || 0;
      const commit = Math.abs(dragX) > W * 0.35 || Math.abs(s.v) > 0.5;
      const dir = (dragX < 0 || s.v < -0.5) ? -1 : 1;
      const atEdge = (dir === -1 && indexRef.current === images.length - 1) || (dir === 1 && indexRef.current === 0);

      if (commit && !atEdge) {
        const target = dir === -1 ? -W : W;
        setStripX(target, true);
        setTimeout(() => {
          setIndex((i) => Math.max(0, Math.min(images.length - 1, i - dir)));
        }, 400);
      } else {
        setStripX(0, true);
      }
      swipe.current = null;
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [images.length, setIndex]);

  // インデックスが変わったら(スワイプ確定後)ストリップを瞬時に0へ戻す
  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.style.transition = "none";
      stripRef.current.style.transform = "translate3d(0,0,0)";
    }
  }, [index]);

  if (!current) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[90] bg-app-bg flex flex-col overflow-hidden touch-none" onClick={(e) => e.stopPropagation()}>
      <div className="flex-1 relative min-h-0">
        <div
          ref={stripRef}
          className="absolute inset-0 flex items-stretch"
          style={{ width: "300vw", left: "-100vw", willChange: "transform", transform: "translate3d(0,0,0)" }}
        >
          {[index - 1, index, index + 1].map((i) => (
            <div key={i} className="w-screen shrink-0 flex items-center justify-center p-6">
              {images[i] && <img src={images[i].src} alt="" draggable={false} className="max-w-full max-h-full object-contain" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-app-bg px-5 py-3 border-t border-app-line" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <input
          value={commentMap[current.src] || ""}
          onChange={(e) => setCommentMap((prev) => ({ ...prev, [current.src]: e.target.value }))}
          placeholder="キャプションを追加"
          className="w-full bg-transparent text-ink placeholder:text-ink-sub text-[15px] outline-none"
        />
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-[4.5rem] left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
          {images.map((_, i) => (
            <span key={i} className={`w-2 h-2 rounded-full ${i === index ? "bg-ink" : "border border-ink-sub bg-transparent"}`} />
          ))}
        </div>
      )}

      {current.libraryPhotoId && (
        <button
          onClick={async (e) => {
            e.stopPropagation();
            deleteLibraryPhoto(current.libraryPhotoId);
            onClose();
          }}
          className="absolute top-14 left-5 h-9 px-3 rounded-full bg-red-600/90 text-white text-xs font-semibold flex items-center justify-center"
        >削除</button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-14 right-3 w-10 h-10 flex items-center justify-center text-ink"
        aria-label="戻る"
      ><ChevronLeft size={24} /></button>
    </div>
  );
}
