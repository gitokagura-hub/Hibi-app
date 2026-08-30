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
 *
 * 【端まで持っていったとき】
 * iOSの標準アプリと同じく、掴んだまま画面の上端・下端に近づけると自動で
 * スクロールする。端に近いほど速く流れる。これが無いと見えている範囲でしか
 * 動かせず、リストが長いと一番上まで持っていけない。
 * スクロールした分は指の移動量に足し込む(でないと画面が流れた分だけ
 * 入る位置がずれる)。
 */

// 自動スクロールの効き始める幅と、いちばん端での速さ(1フレームあたりのpx)
const EDGE = 72;
const MAX_SPEED = 14;

// その要素が実際に乗っているスクロール領域を探す。見つからなければページ全体。
function scrollParentOf(el) {
  let n = el?.parentElement;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
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
  const scroller = useRef(null);   // 自動スクロールさせる領域
  const startScroll = useRef(0);   // 掴んだ時点のスクロール位置
  const lastY = useRef(0);         // 最後に触れていた指のY座標
  const raf = useRef(null);        // 自動スクロールのループ

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clear();
    stopAutoScroll();
    draggingRef.current = false;
    if (moveHandler.current) {
      moveHandler.current.el.removeEventListener("touchmove", moveHandler.current.onMove);
      moveHandler.current = null;
    }
    setDrag(null);
  }, [clear, stopAutoScroll]);

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

  // 指の移動量に、掴んでからスクロールした分を足す。
  // これが無いと、画面が流れた分だけ入る位置がずれる。
  function dyNow() {
    const sc = scroller.current;
    const scrolled = sc ? sc.scrollTop - startScroll.current : 0;
    return lastY.current - startY.current + scrolled;
  }

  // 端に近いほど速く流す。指を止めていても流れ続ける。
  function autoScrollStep() {
    if (!draggingRef.current) return;
    const sc = scroller.current;
    if (sc) {
      const isPage = sc === document.scrollingElement || sc === document.documentElement;
      const r = isPage ? null : sc.getBoundingClientRect();
      const top = isPage ? 0 : r.top;
      const bottom = isPage ? window.innerHeight : r.bottom;
      const y = lastY.current;

      let v = 0;
      if (y < top + EDGE) v = -MAX_SPEED * Math.min(1, (top + EDGE - y) / EDGE);
      else if (y > bottom - EDGE) v = MAX_SPEED * Math.min(1, (y - (bottom - EDGE)) / EDGE);

      if (v) {
        const before = sc.scrollTop;
        sc.scrollTop = before + v;
        // 端まで来て動かなくなったら、位置の計算もやり直さない
        if (sc.scrollTop !== before) {
          const dy = dyNow();
          setDrag((d) => (d ? { ...d, dy, to: computeTo(d.index, dy) } : d));
        }
      }
    }
    raf.current = requestAnimationFrame(autoScrollStep);
  }

  const itemProps = useCallback(
    (index) => ({
      ref: (el) => { els.current[index] = el; },
      onTouchStart: (e) => {
        // 並び替えできる要素が入れ子になっている場合(プロジェクト行の中の
        // テキストなど)、内側で受けたら外側には渡さない。両方が同時に
        // 動き出すと互いに干渉し、背景がスクロールしてしまう。
        e.stopPropagation();
        startY.current = e.touches[0].clientY;
        fired.current = false;
        draggingRef.current = false;

        // 指が触れた時点で非パッシブのリスナを張る。掴んだ後に張っても
        // iOSは既に始めたスクロールを止めてくれないため。
        const el = e.currentTarget;
        const onMove = (ev) => {
          lastY.current = ev.touches[0].clientY;
          if (!draggingRef.current) {
            // まだ掴んでいない状態で指が動いたら、長押しとみなさない
            if (Math.abs(lastY.current - startY.current) > 8) clear();
            return;
          }
          ev.preventDefault(); // 掴んでいる間はページを動かさない
          const dy = dyNow();
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
          // 自動スクロールさせる領域と、その時点の位置を控える
          scroller.current = scrollParentOf(el);
          startScroll.current = scroller.current ? scroller.current.scrollTop : 0;
          lastY.current = startY.current;
          setDrag({ index, dy: 0, to: index });
          if (navigator.vibrate) navigator.vibrate(15);
          stopAutoScroll();
          raf.current = requestAnimationFrame(autoScrollStep);
        }, ms);
      },
      onTouchEnd: (e) => {
        e.stopPropagation();
        clear();
        stopAutoScroll();
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
    [cancel, clear, count, drag, ms, onReorder, stopAutoScroll]
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
