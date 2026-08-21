import { useCallback, useRef, useState } from "react";

/**
 * 長押しで掴んで並び替えるための仕組み。
 *
 * 優先度は色ではなく「並び順」で表す。上にあるものほど優先度が高い、という
 * 考え方なので、長押しで掴んで上下に動かせるようにする。
 *
 * 【操作】
 *   1タップ  … 選択（開かない。誤って開くのを防ぐため）
 *   2タップ  … 中身を開く
 *   長押し   … 掴んで並び替え
 */
export function useReorder(count, onReorder, ms = 450) {
  const [dragIndex, setDragIndex] = useState(null);
  const timer = useRef(null);
  const startY = useRef(0);
  const fired = useRef(false);
  const rowH = useRef(64); // 1行の高さ。掴んだ要素から実測して差し替える
  const lastTo = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    setDragIndex(null);
    lastTo.current = null;
  }, [clear]);

  const itemProps = useCallback(
    (index) => ({
      onTouchStart: (e) => {
        const t = e.touches[0];
        startY.current = t.clientY;
        fired.current = false;
        const el = e.currentTarget;
        if (el?.offsetHeight) rowH.current = el.offsetHeight;
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          setDragIndex(index);
          // 掴んだことを触覚で知らせる
          if (navigator.vibrate) navigator.vibrate(15);
        }, ms);
      },
      onTouchMove: (e) => {
        const t = e.touches[0];
        const dy = t.clientY - startY.current;
        // まだ掴んでいない状態で指が動いたら、長押しとみなさない
        if (dragIndex === null) {
          if (Math.abs(dy) > 8) clear();
          return;
        }
        const shift = Math.round(dy / rowH.current);
        lastTo.current = Math.min(count - 1, Math.max(0, index + shift));
      },
      onTouchEnd: () => {
        clear();
        if (dragIndex !== null) {
          const to = lastTo.current;
          if (to !== null && to !== index) onReorder(index, to);
          setDragIndex(null);
          lastTo.current = null;
        }
      },
      onTouchCancel: cancel,
      onContextMenu: (e) => e.preventDefault(),
      // 長押しするとSafariが文字選択を始めてしまい、並び替えではなく
      // 選択ハンドルが出てしまうため、この要素では選択・長押しメニューを止める。
      style: {
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "pan-y",
      },
    }),
    [cancel, clear, count, dragIndex, ms, onReorder]
  );

  return {
    itemProps,
    dragIndex,
    isDragging: (i) => dragIndex === i,
    // 長押しが発火した直後かどうか。直後のクリックを打ち消すのに使う。
    wasLongPress: () => {
      const v = fired.current;
      fired.current = false;
      return v;
    },
  };
}

// タグの色。落ち着いた色で揃え、選びやすいよう数を絞っている。
export const TAG_COLORS = {
  slate: { dot: "bg-slate-400", chip: "bg-slate-100 text-slate-700" },
  red: { dot: "bg-red-400", chip: "bg-red-100 text-red-700" },
  amber: { dot: "bg-amber-400", chip: "bg-amber-100 text-amber-700" },
  green: { dot: "bg-green-400", chip: "bg-green-100 text-green-700" },
  teal: { dot: "bg-teal-400", chip: "bg-teal-100 text-teal-700" },
  blue: { dot: "bg-blue-400", chip: "bg-blue-100 text-blue-700" },
  violet: { dot: "bg-violet-400", chip: "bg-violet-100 text-violet-700" },
  pink: { dot: "bg-pink-400", chip: "bg-pink-100 text-pink-700" },
};
export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

// 新しいタグには自動で色を割り当てる。タグ名から決めるので、
// 同じタグはいつでも同じ色になる(あとから手動で変更もできる)。
export function autoTagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_KEYS[h % TAG_COLOR_KEYS.length];
}

export function tagChipClass(tag, tagColors) {
  const key = tagColors?.[tag] || autoTagColor(tag);
  return (TAG_COLORS[key] || TAG_COLORS.slate).chip;
}
