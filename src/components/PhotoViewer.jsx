import { useState, useRef } from "react";

// Fullscreen single-photo viewer. Closes only via the × button (backdrop
// tap was found to close accidentally too often).
export function PhotoViewer({ src, onClose }) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-8" onClick={(e) => e.stopPropagation()}>
      <img src={src} alt="" className="max-w-full max-h-full object-contain rounded-2xl" />
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-14 right-5 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center">×</button>
    </div>
  );
}

// A tappable thumbnail: tap opens the fullscreen viewer, long-press (600ms)
// asks for confirmation and deletes if onDelete is provided. If
// onCategoriesChange is provided, a 🏷️ button opens a category picker.
// `img` can be a plain string (old data) or { src, categories } (new data);
// both are normalized here for backward compatibility.
export function PhotoThumb({ img, onDelete, onCategoriesChange, availableCategories, confirm, size = "w-24 h-24" }) {
  const isObj = img && typeof img === "object";
  const src = isObj ? img.src : img;
  const categories = isObj ? (img.categories || []) : [];
  const [viewerOpen, setViewerOpen] = useState(false);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  function handleTouchStart(e) {
    e.stopPropagation();
    longPressed.current = false;
    if (!onDelete) return;
    pressTimer.current = setTimeout(async () => {
      longPressed.current = true;
      if (await confirm("この写真を削除しますか？")) onDelete();
    }, 600);
  }
  function handleTouchEnd(e) {
    e.stopPropagation();
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!longPressed.current) setViewerOpen(true);
  }

  return (
    <>
      <div className="relative flex-shrink-0">
        <img
          src={src}
          alt=""
          className={`${size} object-cover rounded-xl border`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onClick={(e) => e.stopPropagation()}
        />
        {onCategoriesChange && (
          <button
            onClick={(e) => { e.stopPropagation(); setTagSheetOpen(true); }}
            className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
          >🏷️</button>
        )}
        {categories.length > 0 && (
          <span className="absolute bottom-1 left-1 max-w-[80%] truncate rounded-full bg-black/60 text-white text-[9px] px-1.5 py-0.5">
            {categories.join(" / ")}
          </span>
        )}
      </div>
      {viewerOpen && <PhotoViewer src={src} onClose={() => setViewerOpen(false)} />}
      {tagSheetOpen && (
        <CategoryPickerSheet
          selected={categories}
          available={availableCategories}
          onClose={() => setTagSheetOpen(false)}
          onSave={(next) => { onCategoriesChange(next); setTagSheetOpen(false); }}
        />
      )}
    </>
  );
}

// Bottom sheet for picking (multiple) categories for a single photo.
export function CategoryPickerSheet({ selected, available, onClose, onSave }) {
  const [picked, setPicked] = useState(selected);

  function toggle(cat) {
    setPicked((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end bg-black/40" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <h2 className="text-lg font-semibold mb-3">🏷️ カテゴリーを選ぶ</h2>
        {available.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">Settings画面でカテゴリーを作成してください。</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-5">
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
        <button onClick={() => onSave(picked)} className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold mb-2">保存</button>
        <button onClick={onClose} className="w-full text-center text-gray-400 text-sm">キャンセル</button>
      </div>
    </div>
  );
}
