import { useCallback, useRef, useState } from "react";

/**
 * 長押しで掴んで、指に追従させながら並び替える。
 *
 * 優先度は色ではなく「並び順」で表す。上にあるものほど優先度が高い、という
 * 考え方なので、長押しで掴んで自由に上下へ動かせるようにする。
 *
 * 【操作】
 *   1タップ  … 選択（開かない。誤って開くのを防ぐため）
 *   2タップ  … 中身を開く
 *   長押し   … 掴んで並び替え。掴んだカードは指に追従し、他のカードは避ける
 *
 * 【作り】
 * 掴んだ時点で各行の高さと位置を実測しておき、指の移動量から「今どの位置に
 * 入るか」を求める。掴んだカードは translateY で指に追従させ、間にある
 * カードは1行ぶんずらして隙間を作る。指を離した時点の位置で確定する。
 */
export function useReorder(count, onReorder, ms = 400) {
  const [drag, setDrag] = useState(null); // { index, dy, to }
  // iOSは指が触れた瞬間にスクロールするか決めるため、掴んでから止めても間に合わない。
  // touchstartの時点で非パッシブのリスナを張っておき、掴んだ瞬間から
  // preventDefaultできるようにする。その判定にrefを使う。
  const draggingRef = useRef(false);
  const moveHandler = useRef(null);
  const timer = useRef(null);
  const startY = useRef(0);
  const fired = useRef(false);
  const rows = useRef([]); // 掴んだ時点の各行の高さ
  const els = useRef({});  // index -> 要素

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    draggingRef.current = false;
    if (moveHandler.current) {
      moveHandler.current.el.removeEventListener("touchmove", moveHandler.current.onMove);
      moveHandler.current = null;
    }
    setDrag(null);
  }, [clear]);

  // 指の位置から、今どの位置に入るかを求める
  function computeTo(index, dy) {
    const h = rows.current;
    let to = index;
    if (dy > 0) {
      let acc = 0;
      for (let i = index + 1; i < count; i++) {
        acc += h[i] || 0;
        if (dy > acc - (h[i] || 0) / 2) to = i;
        else break;
      }
    } else if (dy < 0) {
      let acc = 0;
      for (let i = index - 1; i >= 0; i--) {
        acc += h[i] || 0;
        if (-dy > acc - (h[i] || 0) / 2) to = i;
        else break;
      }
    }
    return to;
  }

  const itemProps = useCallback(
    (index) => ({
      ref: (el) => { els.current[index] = el; },
      onTouchStart: (e) => {
        startY.current = e.touches[0].clientY;
        fired.current = false;
        draggingRef.current = false;

        // 指が触れた時点で非パッシブのリスナを張る。掴んだ後に張っても
        // iOSは既に始めたスクロールを止めてくれないため。
        const el = e.currentTarget;
        const onMove = (ev) => {
          const dy = ev.touches[0].clientY - startY.current;
          if (!draggingRef.current) {
            // まだ掴んでいない状態で指が動いたら、長押しとみなさない
            if (Math.abs(dy) > 8) clear();
            return;
          }
          ev.preventDefault(); // 掴んでいる間はページを動かさない
          setDrag((d) => (d ? { ...d, dy, to: computeTo(d.index, dy) } : d));
        };
        moveHandler.current = { el, onMove };
        el.addEventListener("touchmove", onMove, { passive: false });

        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          draggingRef.current = true;
          // 掴んだ時点の各行の高さを実測する(カードの高さがまちまちなため)
          rows.current = Array.from({ length: count }, (_, i) =>
            els.current[i]?.offsetHeight || 0
          );
          setDrag({ index, dy: 0, to: index });
          if (navigator.vibrate) navigator.vibrate(15);
        }, ms);
      },
      onTouchEnd: () => {
        clear();
        draggingRef.current = false;
        if (moveHandler.current) {
          moveHandler.current.el.removeEventListener("touchmove", moveHandler.current.onMove);
          moveHandler.current = null;
        }
        setDrag((d) => {
          if (d && d.to !== d.index) onReorder(d.index, d.to);
          return null;
        });
      },
      onTouchCancel: cancel,
      onContextMenu: (e) => e.preventDefault(),
      // 長押しするとSafariが文字選択を始めてしまうため、選択と長押しメニューを止める
      style: {
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        ...transformFor(index),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancel, clear, count, drag, ms, onReorder]
  );

  // 掴んだカードは指に追従、間のカードは1行ぶんずれて隙間を作る
  function transformFor(index) {
    if (!drag) return {};
    const { index: from, dy, to } = drag;
    if (index === from) {
      return {
        transform: `translateY(${dy}px)`,
        zIndex: 50,
        position: "relative",
        opacity: 0.9,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        transition: "none",
      };
    }
    const h = rows.current[from] || 0;
    let shift = 0;
    if (from < to && index > from && index <= to) shift = -h;
    if (from > to && index >= to && index < from) shift = h;
    return {
      transform: `translateY(${shift}px)`,
      transition: "transform 160ms ease",
    };
  }

  return {
    itemProps,
    isDragging: (i) => drag?.index === i,
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
