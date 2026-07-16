import { useState, useEffect } from "react";
import { CalendarDays, Search, FileText, Image, ChevronRight, HardDrive } from "lucide-react";
import {
  isDriveConfigured,
  isDriveConnected,
  wasDriveConnectedBefore,
  connectDrive,
  disconnectDrive,
  ensureDriveConnection,
} from "../googleDrive";

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

function DriveStatusCard() {
  const driveReady = isDriveConfigured();
  const [connected, setConnected] = useState(isDriveConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!driveReady) return;
    if (isDriveConnected()) {
      setConnected(true);
      return;
    }
    // Homeに来るたびに、裏で自動再接続を試みる（同意画面は出さない）
    if (wasDriveConnectedBefore()) {
      ensureDriveConnection()
        .then(() => setConnected(true))
        .catch(() => setConnected(false));
    }
  }, [driveReady]);

  if (!driveReady) return null;

  async function handleTap() {
    if (connected) return;
    setError("");
    setBusy(true);
    try {
      await connectDrive();
      setConnected(true);
    } catch {
      setError("接続に失敗しました。もう一度タップしてください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        onClick={handleTap}
        disabled={connected || busy}
        className={`w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left ${
          connected ? "bg-emerald-50 border-emerald-100" : "bg-gray-50 border-gray-200 active:scale-[0.98]"
        }`}
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            connected ? "bg-emerald-100" : "bg-gray-200"
          }`}
        >
          <HardDrive size={16} className={connected ? "text-emerald-700" : "text-gray-500"} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">Google Drive</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {connected ? "接続済み" : busy ? "接続中…" : "未接続 — タップして接続"}
          </div>
        </div>
        {connected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              disconnectDrive();
              setConnected(false);
            }}
            className="text-xs text-gray-400 px-2"
          >
            解除
          </button>
        )}
      </button>
      {error && <p className="text-xs text-red-500 mt-1.5 px-1">{error}</p>}
    </div>
  );
}

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
        <DriveStatusCard />
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
