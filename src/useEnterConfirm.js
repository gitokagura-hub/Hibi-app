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
export function handleEnterToConfirm(e, action, { allowShiftNewline = false } = {}) {
  if (e.key !== "Enter") return;
  if (allowShiftNewline && e.shiftKey) return; // Shift+Enterは改行のまま(textarea用)
  if (allowShiftNewline) e.preventDefault();
  action();
  e.target.blur();
}
