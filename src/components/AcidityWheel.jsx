import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useResetZoomOnOpen } from "../useResetZoom";

/**
 * 酸度専用のホイール。TimeWheelと同じ仕組み(scroll-snapで1行ずつ吸着)を使う。
 *
 * 【並びについて】
 * 整数列・小数点列とも、上から大きい数、下にいくほど小さい数という並びにする。
 * これは時刻のホイール(上に小さい数、下に大きい数)とは逆の並び。
 * 指で下に払うとプラス側が手前に出てくる動きが欲しい、という指定のため。
 *
 * 【範囲】
 * -5.0〜5.0を0.1刻み。実際の日本酒の酸度はおおむね1.0〜3.0程度だが、
 * 日本酒度と同じ0を中心にした範囲で余裕を持たせている。
 */

const ITEM_H = 36;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

// 上から大きい順(5→0→-5)。指で下に払うとプラス側が出てくる。
const INT_OPTIONS = Array.from({ length: 11 }, (_, i) => 5 - i); // [5,4,...,0,...,-4,-5]
const DEC_OPTIONS = Array.from({ length: 10 }, (_, i) => 9 - i); // [9,8,...,0]

function Column({ options, value, onChange, align, innerRef }) {
  const ref = innerRef;
  const touched = useRef(false);
  const timer = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.indexOf(value));
    el.scrollTop = idx * ITEM_H;
  }, [value, options]);

  function handleScroll() {
    if (!touched.current) return;
    clearTimeout(timer.current);
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
      style={{ height: "100%", scrollbarWidth: "none", overscrollBehavior: "contain" }}
    >
      <div style={{ height: PAD }} />
      {options.map((o) => (
        <div
          key={o}
          className={`snap-center flex items-center text-[19px] tabular-nums ${
            align === "end" ? "justify-end pr-3" : "justify-start pl-3"
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

// value: -5.0〜5.0の数値、または "" (未設定)。未設定は0.0起点で開く。
export default function AcidityWheel({ value, onChange, onClose }) {
  const initial = value === "" || value == null ? 0 : Number(value);
  const [intPart, setIntPart] = useState(Math.trunc(Math.abs(initial)) * Math.sign(initial || 1));
  const [decPart, setDecPart] = useState(Math.round((Math.abs(initial) % 1) * 10));

  useResetZoomOnOpen();
  const rootRef = useRef(null);
  const iRef = useRef(null);
  const dRef = useRef(null);

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

  function readNow() {
    const pick = (ref, options, fallback) => {
      const el = ref.current;
      if (!el) return fallback;
      const idx = Math.round(el.scrollTop / ITEM_H);
      return options[Math.min(options.length - 1, Math.max(0, idx))] ?? fallback;
    };
    const i = pick(iRef, INT_OPTIONS, intPart);
    const d = pick(dRef, DEC_OPTIONS, decPart);
    const sign = i < 0 ? -1 : 1;
    return sign * (Math.abs(i) + d / 10);
  }

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[9999] bg-black/40 flex flex-col justify-end" onClick={onClose}>
      <div
        className="w-full max-w-full overflow-x-hidden bg-app-bg rounded-t-2xl shadow-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-app-line">
          <button onClick={() => { onChange(""); onClose(); }} className="text-sm text-ink-sub py-1.5">
            Clear
          </button>
          <button
            onClick={() => { onChange(readNow().toFixed(1)); onClose(); }}
            className="text-sm font-semibold bg-ink text-app-bg rounded-xl px-6 py-2"
          >
            Done
          </button>
        </div>

        <div className="relative flex items-stretch w-full overflow-hidden" style={{ height: VISIBLE * ITEM_H }}>
          <div
            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-xl bg-app-raised pointer-events-none"
            style={{ height: ITEM_H, width: 160 }}
          />
          <Column options={INT_OPTIONS} value={intPart} onChange={setIntPart} align="end" innerRef={iRef} />
          <span className="relative flex items-center text-[19px] text-ink-sub w-4 justify-center">.</span>
          <Column options={DEC_OPTIONS} value={decPart} onChange={setDecPart} align="start" innerRef={dRef} />
        </div>
      </div>
    </div>,
    document.body
  );
}
