import { CalendarDays, Search, FileText, Image, ChevronRight } from "lucide-react";

const apps = [
  {
    id: "brains",
    title: "Daily Brains",
    icon: CalendarDays,
    description: "カレンダー・メモ・プロジェクト管理",
    status: "ACTIVE",
    accent: "black",
  },
  {
    id: "sukima",
    title: "Sukima",
    icon: Search,
    description: "人物・企業研究、事業の「隙間」発掘",
    status: "ACTIVE",
    accent: "green",
  },
  {
    id: "timeless",
    title: "Timeless Analogue",
    icon: FileText,
    description: "ブランドメディアの下書きワークスペース",
    status: "DRAFTING",
    accent: "brown",
  },
  {
    id: "library",
    title: "Library",
    icon: Image,
    description: "全ワークスペース横断の画像・ファイル一覧",
    status: "ACTIVE",
    accent: "slate",
  },
];

const accentMap = {
  black: { border: "border-gray-900", iconBg: "bg-gray-100", iconText: "text-gray-900", badgeBg: "bg-gray-100", badgeText: "text-gray-600" },
  green: { border: "border-emerald-600", iconBg: "bg-emerald-50", iconText: "text-emerald-700", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" },
  brown: { border: "border-amber-700", iconBg: "bg-amber-50", iconText: "text-amber-800", badgeBg: "bg-amber-50", badgeText: "text-amber-800" },
  slate: { border: "border-slate-500", iconBg: "bg-slate-100", iconText: "text-slate-600", badgeBg: "bg-slate-100", badgeText: "text-slate-600" },
};

export default function HomePage({ onSelect }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header — 既存Layout.jsxと同じスタイル規約に合わせる */}
      <header className="bg-white sticky top-0 z-10">
        <div className="px-5 pt-14 pb-3">
          <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-gray-500">Gito's Workspace</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24">
        <div className="flex flex-col gap-4">
          {apps.map((item) => {
            const Icon = item.icon;
            const a = accentMap[item.accent];
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`text-left bg-white rounded-2xl border border-gray-200 border-l-4 ${a.border} p-5 active:scale-[0.98] transition-transform`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full ${a.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={22} className={a.iconText} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
                      <ChevronRight size={18} className="text-gray-400" />
                    </div>
                    <p className="mt-1 text-sm text-gray-500 leading-relaxed">{item.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${a.badgeBg} ${a.badgeText}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
