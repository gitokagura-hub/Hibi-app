import { useEffect } from "react";

/**
 * ピンチズームで拡大した状態を等倍に戻す。
 *
 * 【なぜ必要か】
 * カレンダーなどをピンチで拡大したままシートやモーダルを開くと、拡大された
 * 縮尺のまま表示されるため、中身が画面からはみ出したり、左右にずれたりして
 * レイアウトが崩れて見える。開いた時点で必ず標準サイズに戻す。
 *
 * 【仕組み】
 * iOS Safari は「viewportの拡大許可を一瞬切ってから戻す」と現在のズーム状態を
 * 等倍にリセットする。現在値を読んで書き戻すと maximum-scale=1.0 が焼き付いて
 * ズーム自体ができなくなるため、固定の基準文字列を出し入れする。
 */

const BASE_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";

export function resetZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute("content", `${BASE_VIEWPORT}, maximum-scale=1.0`);
  setTimeout(() => meta.setAttribute("content", BASE_VIEWPORT), 50);
}

/**
 * シートやモーダルの中で呼ぶと、開いた時点で等倍に戻す。
 *   useResetZoomOnOpen();
 */
export function useResetZoomOnOpen() {
  useEffect(() => {
    resetZoom();
  }, []);
}
