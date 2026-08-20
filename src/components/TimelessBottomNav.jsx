import { PenLine, Sprout, Wine } from "lucide-react";

/**
 * Timeless Analogue の下部ナビゲーション。
 *
 * Timeless Analogue を大元として、その下に事業・プログラムを並べる。
 *   Workspace    … 構想・下書き（従来からある部分）
 *   Master Pando … 講座プログラム。Masterコース単発で終わらせず、
 *                  今後シリーズ化できるよう枠として置いている
 *   ByMaeNikko   … 酒類事業（日本ではTimeless Analogue、ロンドンでは
 *                  ByMaeNikko Ltd.として法人化する予定）。酒類台帳などが入る
 */
export default function TimelessBottomNav({ current, setTab }) {
  const items = [
    { id: "workspace", label: "Workspace", icon: PenLine },
    { id: "pando", label: "Master Pando", icon: Sprout },
    { id: "bymaenikko", label: "ByMaeNikko", icon: Wine },
  ];

  return (
    <nav
      // z-40: シートやモーダル(z-50以上)より下に来るように明示する。
      className="fixed bottom-0 left-0 right-0 z-40 bg-app-bg/90 backdrop-blur-xl border-t border-app-line h-20 flex items-center justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className="flex flex-col items-center gap-1 px-3 py-1"
          >
            <Icon size={22} className={active ? "text-ink" : "text-ink-sub"} strokeWidth={active ? 2.2 : 1.8} />
            <span className={`text-[11px] ${active ? "text-ink font-semibold" : "text-ink-sub"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
