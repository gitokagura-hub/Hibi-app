import { useEffect, useRef, useState } from "react";

/**
 * 自前のホイール式 時刻選択。
 *
 * 【なぜ自前で作るか】
 * iOSの input[type=time] は、値が空のときホイールに「現在時刻」を表示する。
 * そのため「開始15:00 / 終了は未設定」の状態で終了を開くと、無関係な現在時刻
 * (例:17:11)が選ばれているように見えてしまう。値を先に埋めて回避していたが、
 * 空欄なら0:00から始まるのが自然なので、選択部分ごと自前にする。
 *
 * 【作り】
 * 時と分をそれぞれ縦スクロールのリストにし、中央の行が選択値。
 * scroll-snap で1行ずつ吸着させ、スクロールが止まった時点の位置から値を決める。
 * 分は10分刻み。
 */

const ITEM_H = 36; // 1行の高さ(px)
const VISIBLE = 5; // 見える行数(奇数。中央が選択行)
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 6 }, (_, i) => String(i * 10).padStart(2, "0"));

function Column({ options, value, onChange }) {
  const ref = useRef(null);
  const timer = useRef(null);

  // 外から値が変わったら、その位置までスクロールを合わせる
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.indexOf(value));
    el.scrollTop = idx * ITEM_H;
  }, [value, options]);

  function handleScroll() {
    clearTimeout(timer.current);
    // スクロールが止まってから値を確定する(途中の値を拾わないように)
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const next = options[Math.min(options.length - 1, Math.max(0, idx))];
      if (next !== value) onChange(next);
    }, 120);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="tw-col relative flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory"
      // overscrollBehavior: "contain" で、端まで来てもスクロールが背後の画面に
      // 伝わらないようにする(ホイールを回すと後ろのページまで動いてしまうため)。
      style={{ height: VISIBLE * ITEM_H, scrollbarWidth: "none", overscrollBehavior: "contain" }}
    >
      <div style={{ height: PAD }} />
      {options.map((o) => (
        <div
          key={o}
          className={`snap-center flex items-center justify-center text-[19px] tabular-nums ${
            o === value ? "text-ink font-semibold" : "text-ink-sub/60"
          }`}
          style={{ height: ITEM_H }}
        >
          {o}
        </div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  );
}

/**
 * value: "HH:MM" もしくは "" (未設定)
 * 未設定のまま開いた場合は 0:00 を起点にする(現在時刻は使わない)。
 */
export default function TimeWheel({ value, onChange, onClose, min }) {
  const [h, setH] = useState(() => (value ? value.split(":")[0] : "00"));
  const [m, setM] = useState(() => (value ? value.split(":")[1] : "00"));

  // シートを開いている間は背後のページのスクロールを止める。
  // iOSでは body が動いてしまい、ホイールを回すと後ろまで一緒に動くため。
  //
  // Reactの onTouchMove はパッシブ扱いで preventDefault が効かないことがあるので、
  // ネイティブのイベントを非パッシブで登録して確実に止める。
  // ホイールの列(.tw-col)の中で起きたものだけ通し、それ以外は全部止める。
  const rootRef = useRef(null);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onTouchMove(e) {
      if (!e.target.closest || !e.target.closest(".tw-col")) e.preventDefault();
    }
    const el = rootRef.current;
    el?.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.body.style.overflow = prevOverflow;
      el?.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // 分が10分刻みに乗っていない既存データ(例 09:05)は、近い方に丸めて表示する
  useEffect(() => {
    if (!MINUTES.includes(m)) {
      const n = Math.round(Number(m) / 10) * 10;
      setM(String(Math.min(50, n)).padStart(2, "0"));
    }
  }, [m]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] bg-black/40 flex items-end"
      onClick={onClose}
    >
      <div className="w-full bg-app-bg rounded-t-2xl pt-3 pb-8" onClick={(e) => e.stopPropagation()}>
        {/* 白い枠の中を左半分=時、右半分=分にきっちり分ける。
            列の幅が狭いと、その外側を触ったスクロールが背後の画面に届いてしまうため、
            枠内は隙間なく2つの列で埋める。 */}
        <div className="relative flex items-stretch px-4" style={{ touchAction: "pan-y" }}>
          {/* 中央の選択行を示す帯 */}
          <div
            className="absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-xl bg-app-raised pointer-events-none"
            style={{ height: ITEM_H }}
          />
          <Column options={HOURS} value={h} onChange={setH} />
          <span className="relative flex items-center text-[19px] text-ink-sub px-1">:</span>
          <Column options={MINUTES} value={m} onChange={setM} />
        </div>

        <div className="flex items-center justify-between px-5 pt-3">
          <button
            onClick={() => { onChange(""); onClose(); }}
            className="text-sm text-ink-sub px-3 py-2"
          >
            Clear
          </button>
          <button
            onClick={() => {
              // min(開始時刻)より前は選べない。前を選んだ場合はminに丸める。
              const picked = `${h}:${m}`;
              onChange(min && picked < min ? min : picked);
              onClose();
            }}
            className="text-sm font-semibold bg-ink text-app-bg rounded-xl px-5 py-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
