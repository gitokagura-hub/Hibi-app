import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useResetZoomOnOpen } from "../useResetZoom";

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

function Column({ options, value, onChange, align = "center", innerRef }) {
  const ref = innerRef;
  const timer = useRef(null);
  // ユーザーが実際に触るまでは値を確定しない。
  // 開いた直後はまだ高さが確定しておらず scrollTop が 0 のままになることがあり、
  // それを「先頭の項目が選ばれた」と誤って読み取って値を00に書き換えてしまうため。
  const touched = useRef(false);

  // 外から値が変わったら、その位置までスクロールを合わせる。
  // useLayoutEffect で描画直後に実行し、高さが確定してから位置を入れる。
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.indexOf(value));
    el.scrollTop = idx * ITEM_H;
  }, [value, options]);

  function handleScroll() {
    if (!touched.current) return;
    clearTimeout(timer.current);
    // スクロールが止まってから値を確定する(途中の値を拾わないように)
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const next = options[Math.min(options.length - 1, Math.max(0, idx))];
      if (next !== value) onChange(next);
    }, 140);
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      onTouchStart={() => { touched.current = true; }}
      onMouseDown={() => { touched.current = true; }}
      className="tw-col relative flex-1 min-w-0 overflow-y-auto no-scrollbar snap-y snap-mandatory"
      // overscrollBehavior: "contain" で、端まで来てもスクロールが背後の画面に
      // 伝わらないようにする(ホイールを回すと後ろのページまで動いてしまうため)。
      style={{ height: "100%", scrollbarWidth: "none", overscrollBehavior: "contain" }}
    >
      <div style={{ height: PAD }} />
      {options.map((o) => (
        <div
          key={o}
          className={`snap-center flex items-center text-[19px] tabular-nums ${
            align === "end" ? "justify-end pr-3" : align === "start" ? "justify-start pl-3" : "justify-center"
          } ${o === value ? "text-ink font-semibold" : "text-ink-sub/60"}`}
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
  // 拡大したままシートを開くとレイアウトが崩れるため、開いた時点で等倍に戻す。
  useResetZoomOnOpen();

  const rootRef = useRef(null);
  const hRef = useRef(null);
  const mRef = useRef(null);

  // Doneを押した時点のスクロール位置から直接読み取る。
  // 指を離した直後は状態への反映が間に合っていないことがあるため、
  // 見えている位置をそのまま採用する。
  function readNow() {
    const pick = (ref, options, fallback) => {
      const el = ref.current;
      if (!el) return fallback;
      const idx = Math.round(el.scrollTop / ITEM_H);
      return options[Math.min(options.length - 1, Math.max(0, idx))] || fallback;
    };
    return `${pick(hRef, HOURS, h)}:${pick(mRef, MINUTES, m)}`;
  }
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

  // body直下に描画する。カレンダー画面では下部ナビゲーションバーが後から
  // 描画される関係でシートの上に重なり、ホイールが隠れてしまうため。
  return createPortal(
    // 画面全体を覆い、シートを下端にぴったり貼り付ける。
    // items-end だけだと中身の高さ次第で浮いて見えるため、シート側で
    // 幅・余白・高さを明示して組む。
    <div ref={rootRef} className="fixed inset-0 z-[9999] bg-black/40 flex flex-col justify-end" onClick={onClose}>
      <div
        className="w-full max-w-full overflow-x-hidden bg-app-bg rounded-t-2xl shadow-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー: Clear(左) / Done(右)。左右に余白を取り、端に張り付かないようにする */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-app-line">
          <button
            onClick={() => { onChange(""); onClose(); }}
            className="text-sm text-ink-sub py-1.5"
          >
            Clear
          </button>
          <button
            onClick={() => {
              // min(開始時刻)より前は選べない。前を選んだ場合はminに丸める。
              const picked = readNow();
              onChange(min && picked < min ? min : picked);
              onClose();
            }}
            className="text-sm font-semibold bg-ink text-app-bg rounded-xl px-6 py-2"
          >
            Done
          </button>
        </div>

        {/* ホイール本体。5行ぶんの高さを確保して、中央行が選択値。
            数字は中央に寄せる一方、スクロールを受け止める列(.tw-col)は
            左右いっぱいに広げる(狭いと外側を触ったスクロールが背後に届くため)。 */}
        <div className="relative flex items-stretch w-full overflow-hidden" style={{ height: VISIBLE * ITEM_H }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-xl bg-app-raised pointer-events-none"
            style={{ height: ITEM_H, width: 160 }}
          />
          <Column options={HOURS} value={h} onChange={setH} align="end" innerRef={hRef} />
          <span className="relative flex items-center text-[19px] text-ink-sub w-5 justify-center">:</span>
          <Column options={MINUTES} value={m} onChange={setM} align="start" innerRef={mRef} />
        </div>
      </div>
    </div>,
    document.body
  );
}
