import { useEffect, useRef, useState } from "react";
import BottomNavigation from "./BottomNavigation";
import SpaceSwitcher from "./SpaceSwitcher";
import { useData } from "../dataStore";

// iOS標準アプリの「ラージタイトル」挙動:
// - 画面上部に細いバーが常駐(戻る/操作ボタン用のスロット付き)
// - 大タイトルはコンテンツと一緒にスクロールして流れていく
// - 大タイトルがバーの下を通過した瞬間、バーが黒+ブラー+ヘアライン化し、
//   バー中央に小タイトルがフェードインする(iOSのUINavigationBar相当)
// scrollイベントは使わず、大タイトル直下の1px番兵をIntersectionObserverで
// 監視するだけなので、毎フレームの計算が無くスクロールが重くならない。
const BAR_H = 44; // コンパクトバーの高さ(px)

export default function Layout({ title, subtitle, current, setTab, barLeft, barRight, hideSpaceSwitcher, children }) {
  const mainRef = useRef(null);
  const sentinelRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const { cloudError } = useData();

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    const sentinel = sentinelRef.current;
    if (!main || !sentinel || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { root: main, rootMargin: `-${BAR_H}px 0px 0px 0px` }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  return (
    <div className="h-[100dvh] overflow-hidden bg-app-bg text-ink flex flex-col relative">
      {/* 常駐コンパクトバー */}
      <div
        className={`absolute top-0 inset-x-0 z-30 transition-colors duration-200 ${
          collapsed ? "bg-app-bg/75 backdrop-blur-xl border-b border-app-line/70" : "bg-transparent border-b border-transparent"
        }`}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="relative flex items-center justify-between px-4" style={{ height: BAR_H }}>
          <div className="flex items-center min-w-[44px]">{barLeft}</div>
          <span
            className={`absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold transition-opacity duration-200 ${
              collapsed ? "opacity-100" : "opacity-0"
            }`}
          >
            {title}
          </span>
          <div className="flex items-center justify-end min-w-[44px] gap-3">{barRight}</div>
        </div>
      </div>

      {/* Content */}
      <main ref={mainRef} data-scroll-root className="flex-1 overflow-y-auto pb-24">
        {cloudError && (
          <div className="bg-red-600 text-white px-4 py-3 text-[13px] leading-snug" style={{ paddingTop: `calc(env(safe-area-inset-top) + ${BAR_H}px)` }}>
            <p className="font-bold">⚠ クラウド保存に失敗しています</p>
            <p className="mt-1 opacity-90">
              この端末にしか保存されていません。データ量: {cloudError.sizeMB}MB
              {Number(cloudError.sizeMB) > 5 && "（写真やファイルが多すぎる可能性があります）"}
            </p>
            <p className="mt-1 opacity-75 text-[11px]">{cloudError.message}</p>
          </div>
        )}
        <header
          className="bg-app-bg px-5 pb-2"
          style={{ paddingTop: cloudError ? "1rem" : `calc(env(safe-area-inset-top) + ${BAR_H}px)` }}
        >
          <h1 className="text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-sub">{subtitle}</p>}
        </header>
        {/* 番兵: ここがバーの下に潜ったら collapsed */}
        <div ref={sentinelRef} className="h-px" />
        {!hideSpaceSwitcher && <SpaceSwitcher />}
        {children}
      </main>

      <BottomNavigation current={current} setTab={setTab} />
    </div>
  );
}
