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
      className="relative overflow-y-auto no-scrollbar snap-y snap-mandatory"
      // overscrollBehavior: "contain" で、端まで来てもスクロールが背後の画面に
      // 伝わらないようにする(ホイールを回すと後ろのページまで動いてしまうため)。
      style={{ height: VISIBLE * ITEM_H, width: 64, scrollbarWidth: "none", overscrollBehavior: "contain" }}
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
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
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
      className="fixed inset-0 z-[70] bg-black/40 flex items-end"
      onClick={onClose}
      onTouchMove={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
    >
      <div
        className="w-full bg-app-bg rounded-t-2xl pt-3 pb-8"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        style={{ touchAction: "auto" }}
      >
        <div className="relative flex items-center justify-center gap-2">
          {/* 中央の選択行を示す帯 */}
          <div
            className="absolute left-6 right-6 rounded-xl bg-app-raised pointer-events-none"
            style={{ height: ITEM_H }}
          />
          <Column options={HOURS} value={h} onChange={setH} />
          <span className="text-[19px] text-ink-sub relative">:</span>
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
