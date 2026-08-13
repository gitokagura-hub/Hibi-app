// Enterキーで確定する入力欄の挙動を、アプリ全体で統一するためのヘルパー。
//
// これまで各画面が個別にonKeyDownでEnter判定を書いており、確定後に
// input/textareaのフォーカスを外す処理がある画面と無い画面が混在
// していた。フォーカスが残ったままだと、iOSでキーボードが閉じる
// タイミングやスクロール位置の戻り方が画面ごとにバラバラになり、
// 「リターンしたら一番上に戻る画面」と「下の方に留まる画面」が
// 混在する原因になっていた。
//
// このヘルパーを使えば、確定処理(action)を実行した直後に必ず
// input/textareaからフォーカスを外し、キーボードを閉じる挙動を
// 統一できる。
function findScrollableAncestor(el) {
  let node = el?.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY);
    if (canScrollY && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null; // 見つからなければwindow自体をスクロールする
}

export function handleEnterToConfirm(e, action, { allowShiftNewline = false } = {}) {
  if (e.key !== "Enter") return;
  if (allowShiftNewline && e.shiftKey) return; // Shift+Enterは改行のまま(textarea用)
  if (allowShiftNewline) e.preventDefault();
  const inputEl = e.target;
  action();
  inputEl.blur();
  // フォーカスを外すだけではスクロール位置は動かないため、明示的に
  // 一番上へ戻す。実際にスクロールしている祖先要素をDOMから自動で
  // 探すことで、画面ごとにLayout.jsxのmainRef/独自のoverflow-y-auto/
  // window全体スクロールのどれを使っていても対応できる。
  requestAnimationFrame(() => {
    const scrollEl = findScrollableAncestor(inputEl);
    if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
