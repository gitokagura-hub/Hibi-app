import { useEffect, useRef } from "react";

/**
 * 画面左端からのスワイプで戻る（iOSのエッジスワイプに近い挙動）を実装する共通フック。
 * 各ページで useSwipeBack(戻る関数) と呼ぶだけで使える。
 */
export function useSwipeBack(onBack, options = {}) {
  const { edgeWidth = 28, threshold = 70 } = options;
  const startX = useRef(null);
  const startY = useRef(null);

  useEffect(() => {
    function handleTouchStart(e) {
      const t = e.touches[0];
      if (t.clientX <= edgeWidth) {
        startX.current = t.clientX;
        startY.current = t.clientY;
      } else {
        startX.current = null;
      }
    }
    function handleTouchEnd(e) {
      if (startX.current == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX.current;
      const dy = Math.abs(t.clientY - (startY.current ?? t.clientY));
      startX.current = null;
      if (dx > threshold && dy < 60) {
        onBack();
      }
    }
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onBack, edgeWidth, threshold]);
}
