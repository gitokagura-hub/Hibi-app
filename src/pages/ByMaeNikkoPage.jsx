import { ChevronLeft } from "lucide-react";
import TimelessBottomNav from "../components/TimelessBottomNav";

/**
 * ByMaeNikko。
 *
 * 酒類事業。日本ではTimeless Analogue、ロンドンではByMaeNikko Ltd.として
 * 法人化する予定で、この画面はその事業側の入り口。
 *
 * 酒類の法定帳簿(仕入・売上の記帳)は税務署・税理士に提出する前提のため、
 * 台帳そのものはGoogleスプレッドシートで持ち、この画面は入力の窓口や
 * 事業まわりの情報置き場として使う想定。様式は免許取得時に税務署から
 * 案内される内容に合わせて決める。
 */
export default function ByMaeNikkoPage({ onHome, tab, setTab }) {
  return (
    <div className="min-h-screen bg-app-bg relative pb-28">
      <button
        onClick={onHome}
        className="fixed bottom-24 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3">
        {/* 上に大元(Timeless Analogue)を小さく置いて、階層が分かるようにする */}
        <p className="text-[11px] font-semibold tracking-widest text-ink-sub uppercase">
          Timeless Analogue
        </p>
        <h1 className="mt-0.5 text-3xl font-semibold tracking-tight">ByMaeNikko</h1>
        <p className="mt-1 text-sm text-ink-sub">Sake export</p>
      </header>

      <div className="px-5 pt-6">
        <div className="rounded-2xl border border-app-line bg-app-surface p-5">
          <p className="text-sm text-ink-sub leading-relaxed">
            酒類事業の入り口です。中身はこれから作ります。
          </p>
        </div>
      </div>

      <TimelessBottomNav current={tab} setTab={setTab} />
    </div>
  );
}
