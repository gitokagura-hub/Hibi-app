import { ChevronLeft } from "lucide-react";
import TimelessBottomNav from "../components/TimelessBottomNav";

/**
 * Master Pando。
 *
 * Masterコース単発で終わらせず、今後シリーズ化していく前提で置いている枠。
 * 「Pando という器の中に、個々のプログラム(第1弾がMasterコース)がある」
 * という持ち方にしておくと、第2弾以降を足すときに構造を変えずに済む。
 *
 * 中身はこれから設計するため、現時点では入れ物のみ。
 */
export default function MasterPandoPage({ onHome, tab, setTab }) {
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
        <h1 className="mt-0.5 text-3xl font-semibold tracking-tight">Master Pando</h1>
        <p className="mt-1 text-sm text-ink-sub">Course programs</p>
      </header>

      <div className="px-5 pt-6">
        <div className="rounded-2xl border border-app-line bg-app-surface p-5">
          <p className="text-sm text-ink-sub leading-relaxed">
            シリーズの器として用意した画面です。中身はこれから作ります。
          </p>
        </div>
      </div>

      <TimelessBottomNav current={tab} setTab={setTab} />
    </div>
  );
}
