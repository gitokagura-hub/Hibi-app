import { Hammer, BookOpen } from "lucide-react";

/**
 * WA NO KATA の下部ナビゲーション。見た目と動きは TimelessBottomNav と揃えている。
 *   WA NO KATA … 作り手(仕事の相手)の一覧
 *   Sukima     … 企業・人物の研究
 */
export default function WaNoKataBottomNav({ current, setTab }) {
  const items = [
    { id: "wanokata", label: "WA NO KATA", icon: Hammer },
    { id: "sukima", label: "Sukima", icon: BookOpen },
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
