import { useRef, useCallback } from "react";

// 長押し(既定550ms)を検知する共通フック。カード全体がボタン(onClick)に
// なっている画面(Notes/Projects)で、長押しだけを別の操作(優先度の変更)
// に割り当てるために使う。
//
// 使い方:
//   const { handlers, wasLongPress } = useLongPress(() => cyclePriority(item.id));
//   <button {...handlers} onClick={(e) => { if (wasLongPress()) return; openEditor(item); }}>
//
// 長押し発火後にそのままtouchendへ続くと、ブラウザは通常のclickイベントも
// 追って発火させる。これをそのままonClickに通すと「優先度を変えたつもりが
// 編集画面まで開いてしまう」ため、wasLongPress()で直前が長押しだったかを
// 一度だけ読み取り、trueならonClick側の処理を打ち切る運用にしている。
export function useLongPress(onLongPress, ms = 550) {
  const timerRef = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (x, y) => {
      startPos.current = { x, y };
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        if (navigator.vibrate) {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        onLongPress();
      }, ms);
    },
    [onLongPress, ms, clear]
  );

  // 指が大きく動いたらスクロール操作とみなしてキャンセルする。
  const move = useCallback(
    (x, y) => {
      const dx = Math.abs(x - startPos.current.x);
      const dy = Math.abs(y - startPos.current.y);
      if (dx > 10 || dy > 10) clear();
    },
    [clear]
  );

  function wasLongPress() {
    const v = firedRef.current;
    firedRef.current = false;
    return v;
  }

  const handlers = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      if (t) start(t.clientX, t.clientY);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseMove: (e) => {
      if (timerRef.current) move(e.clientX, e.clientY);
    },
    onMouseUp: clear,
    onMouseLeave: clear,
    // iOSでテキスト選択メニュー(コピー/共有)が長押しで出てくるのを抑止する。
    onContextMenu: (e) => e.preventDefault(),
  };

  return { handlers, wasLongPress };
}

// 優先度は 0(低) → 1(中) → 2(高) → 0 の3段階で巡回する。
export function nextPriority(current) {
  return ((current || 0) + 1) % 3;
}

export const PRIORITY_LABELS = ["低", "中", "高"];
export const PRIORITY_BORDER_COLORS = [null, "#FF9F0A", "#FF375F"]; // 低は枠なし、中はオレンジ、高は赤
