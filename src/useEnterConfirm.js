// Enterキーで確定する入力欄の挙動を、アプリ全体で統一するためのヘルパー。
//
// これまで各画面が個別にonKeyDownでEnter判定を書いており、確定後に
// input/textareaのフォーカスを外す処理がある画面と無い画面が混在
// していた。フォーカスが残ったままだと、iOSでキーボードが閉じる
// タイミングやスクロール位置の戻り方が画面ごとにバラバラになり、
// 「リターンしたら一番上に戻る画面」と「下の方に留まる画面」が
// 混在する原因になっていた。
//
// ファーブル5設計: 祖先要素をDOMから辿る方式は、確定処理で入力欄が
// アンマウントされると孤児化して辿れなくなるため、iOSでは高確率で
// 外れる。代わりに、アプリのスクロール実体(Layout.jsx/CalendarPage.jsx
// の<main data-scroll-root>)を data-scroll-root 属性で直接掴む方式にする。

// アプリの唯一のスクロール実体を先頭に戻す。
// smooth指定はiOSのキーボード遷移中は無視されがちなので使わない。
export function scrollAppTop() {
  const el = document.querySelector("[data-scroll-root]");
  if (el) { el.scrollTop = 0; return; }
  window.scrollTo(0, 0);
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

export function handleEnterToConfirm(e, action, { allowShiftNewline = false } = {}) {
  if (e.key !== "Enter") return;
  if (allowShiftNewline && e.shiftKey) return; // Shift+Enterは改行のまま(textarea用)
  if (allowShiftNewline) e.preventDefault();
  const inputEl = e.target;
  action();
  inputEl.blur();
  // キーボード収納の完了を待たず「複数回」効かせるのがiOSでは確実。
  // 最後にvisualViewportのresize(キーボードが閉じ切った瞬間)を検知して
  // もう一度確定させる。
  scrollAppTop();
  setTimeout(scrollAppTop, 120);
  setTimeout(scrollAppTop, 400);
  if (window.visualViewport) {
    const onResize = () => {
      scrollAppTop();
      window.visualViewport.removeEventListener("resize", onResize);
    };
    window.visualViewport.addEventListener("resize", onResize);
  }
}
