import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search, MinusCircle, Trash2, X } from "lucide-react";
import { useSukima } from "../sukimaStore";
import { useData } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";
import DriveGallery from "../components/DriveGallery";

/* =========================================================================
   WA NO KATA — 作り手(maker)
   人物・企業(研究用15項目)とは別系統。項目定義もキーも共有しない。
   アンケートで流す問は q: true。枠(SEARCH〜DEAL)は後から手で埋める。
   ========================================================================= */

export const STAGES = [
  null,
  { en: "MEET", ja: "会った" },
  { en: "SEARCH", ja: "調べた" },
  { en: "CONTACT", ja: "問い合わせた" },
  { en: "VISIT", ja: "訪問した" },
  { en: "DEAL", ja: "契約した" },
];

const FOOD = ["酒", "食品・調味料"];
const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// g: 群 / s: 段 / k: 入力の型 / q: アンケートで流す / f: 酒・食品のときだけ / warn: 空なら警告
export const MAKER_QS = [
  { id: "name", g: "MEET", s: 1, t: "名前", k: "text", q: true },
  { id: "tanto", g: "MEET", s: 1, t: "担当者", k: "sel", o: ["本人", "家族", "従業員", "組合・団体の人", "未確認"], q: true },
  { id: "tname", g: "MEET", s: 1, t: "会った人の名前", k: "text", q: true },
  { id: "item", g: "MEET", s: 1, t: "品目", k: "multi", o: ["酒", "食品・調味料", "木工・指物", "金工・刃物", "漆", "和紙", "染織", "陶磁", "その他"], q: true },
  { id: "area", g: "MEET", s: 1, t: "産地", k: "text", q: true },
  { id: "itemn", g: "MEET", s: 1, t: "品目の数", k: "sel", o: ["1〜3", "4〜10", "11〜30", "31以上", "未確認"], q: true },
  { id: "price", g: "MEET", s: 1, t: "価格帯", k: "multi", o: ["〜3千円", "3千〜1万", "1万〜5万", "5万以上", "幅が広い"], q: true },
  { id: "memo", g: "MEET", s: 1, t: "メモ", k: "area" },
  { id: "oemA", g: "作れる形", s: 1, t: "OEM・PBの実績", k: "sel", o: ["現在ある", "過去にあった", "ない", "未確認"], q: true },
  { id: "oemB", g: "作れる形", s: 1, t: "OEM・PBの意向", k: "sel", o: ["やりたい", "条件次第", "やりたくない", "未確認"], q: true },
  { id: "lead", g: "作れる形", s: 1, t: "納期", k: "sel", o: ["在庫あり", "数週間", "数か月", "受注次第", "未確認"], q: true },
  { id: "pay", g: "作れる形", s: 1, t: "支払い条件", k: "sel", o: ["前払い", "出荷時払い", "サイトあり", "相談可", "未確認"], q: true },
  { id: "exp", g: "海外", s: 1, t: "輸出", k: "sel", o: ["している", "過去にあった", "ない", "未確認"], q: true },
  { id: "excl", g: "海外", s: 1, t: "独占", k: "sel", o: ["国ごとに求める", "世界で1社", "求めない", "要相談", "未確認"], q: true },
  { id: "eng", g: "海外", s: 1, t: "英語表示", k: "sel", o: ["ある", "ない", "作れば出せる", "未確認"], q: true },
  { id: "ani", g: "規制", s: 1, t: "動物性原料", k: "sel", o: ["入っていない", "入っている", "未確認"], q: true, f: true },
  { id: "temp", g: "規制", s: 1, t: "保存", k: "multi", o: ["常温可", "要冷蔵", "要冷凍", "未確認"], q: true, f: true },
  { id: "life", g: "規制", s: 1, t: "賞味期限", k: "text", q: true, f: true },
  { id: "alg", g: "規制", s: 1, t: "アレルゲン表示", k: "sel", o: ["ある", "ない", "未確認"], q: true, f: true },
  { id: "cap", g: "体験", s: 1, t: "受入人数", k: "sel", o: ["1〜2人", "3〜5人", "6人以上", "難しい", "未確認"], q: true },
  { id: "busy", g: "体験", s: 1, t: "繁忙期", k: "mon", q: true },
  { id: "teach", g: "体験", s: 1, t: "指導経験", k: "sel", o: ["ある", "ない", "未確認"], q: true },
  { id: "head", g: "コミュニティ", s: 1, t: "従業員数", k: "sel", o: ["1人", "2〜3人", "4〜9人", "10人以上", "未確認"], q: true },
  { id: "succ", g: "コミュニティ", s: 1, t: "後継ぎ", k: "sel", o: ["いる", "いない", "これから", "未確認"], q: true },
  { id: "cross", g: "コミュニティ", s: 1, t: "他業種への興味", k: "sel", o: ["強い", "ある", "薄い", "未確認"], q: true },
  { id: "imp", g: "締め", s: 1, t: "その場の印象", k: "area", q: true },
  { id: "j1", g: "締め", s: 1, t: "商材への興味", k: "tri", q: true },
  { id: "j2", g: "締め", s: 1, t: "体験への興味", k: "tri", q: true },
  { id: "j3", g: "締め", s: 1, t: "コミュニティへの興味", k: "tri", q: true },

  { id: "tel", g: "SEARCH", s: 2, t: "連絡先", k: "text" },
  { id: "web", g: "SEARCH", s: 2, t: "HP・SNS", k: "text" },
  { id: "cust", g: "SEARCH", s: 2, t: "既存の取引先", k: "text" },
  { id: "jtr", g: "SEARCH", s: 2, t: "日本側の商社", k: "text" },
  { id: "imp2", g: "SEARCH", s: 2, t: "海外インポーター", k: "text" },
  { id: "mkt", g: "SEARCH", s: 2, t: "市場価格", k: "text" },

  { id: "cday", g: "CONTACT", s: 3, t: "初回連絡日", k: "text" },
  { id: "cway", g: "CONTACT", s: 3, t: "連絡手段", k: "sel", o: ["メール", "電話", "郵送", "SNS"] },
  { id: "csent", g: "CONTACT", s: 3, t: "送付資料", k: "text" },
  { id: "cres", g: "CONTACT", s: 3, t: "返信", k: "sel", o: ["あり", "なし", "保留"] },
  { id: "cstaff", g: "CONTACT", s: 3, t: "窓口担当", k: "area" },
  { id: "cdec", g: "CONTACT", s: 3, t: "決裁者", k: "sel", o: ["本人", "家族", "役員", "組合", "未確認"] },
  { id: "creact", g: "CONTACT", s: 3, t: "反応", k: "sel", o: ["前向き", "検討中", "消極的"] },
  { id: "clog", g: "CONTACT", s: 3, t: "経過記録", k: "area" },

  { id: "vday", g: "VISIT", s: 4, t: "訪問日", k: "text" },
  { id: "vwith", g: "VISIT", s: 4, t: "同行者", k: "text" },
  { id: "vfac", g: "VISIT", s: 4, t: "生産設備", k: "text" },
  { id: "vcap_m", g: "VISIT", s: 4, t: "月産能力", k: "text" },
  { id: "vppl", g: "VISIT", s: 4, t: "生産体制（人数・年齢層）", k: "text" },
  { id: "vcap", g: "VISIT", s: 4, t: "見学受入人数", k: "text" },
  { id: "vdoc", g: "VISIT", s: 4, t: "事務対応", k: "sel", o: ["代表者", "事務担当あり", "難しい", "未確認"] },
  { id: "vcrt", g: "VISIT", s: 4, t: "検査証明", k: "sel", o: ["要", "不要", "未確認"] },
  { id: "vsee", g: "VISIT", s: 4, t: "所見", k: "area" },

  { id: "kknd", g: "DEAL", s: 5, t: "契約の種類", k: "text" },
  { id: "kday", g: "DEAL", s: 5, t: "契約日", k: "text" },
  { id: "kexc", g: "DEAL", s: 5, t: "独占の範囲", k: "sel", o: ["国ごと", "世界で1社", "なし"] },
  { id: "kvol", g: "DEAL", s: 5, t: "販売数量の取り決め", k: "text", warn: true },
  { id: "ktrm", g: "DEAL", s: 5, t: "契約期間", k: "text" },
  { id: "kbse", g: "DEAL", s: 5, t: "取引基本契約", k: "sel", o: ["あり", "なし", "作成中"] },
  { id: "ktm", g: "DEAL", s: 5, t: "商標の扱い", k: "text" },
  { id: "kpho", g: "DEAL", s: 5, t: "写真の使用許諾", k: "sel", o: ["あり", "なし", "口頭のみ"] },
  { id: "kpay", g: "DEAL", s: 5, t: "支払い条件（確定）", k: "text" },
  { id: "krat", g: "DEAL", s: 5, t: "掛け率", k: "text" },
  { id: "kreg", g: "DEAL", s: 5, t: "相手国の登録手続き", k: "text" },
  { id: "klab", g: "DEAL", s: 5, t: "ラベルの取り決め", k: "text" },
];

export const PRODUCT_FIELDS = [
  { id: "n", t: "商品名", k: "text" },
  { id: "kind", t: "種類", k: "text" },
  { id: "size", t: "容量・サイズ", k: "text" },
  { id: "retail", t: "希望小売価格", k: "text" },
  { id: "whole", t: "卸値", k: "text" },
  { id: "lot", t: "最低ロット", k: "text" },
  { id: "stock", t: "在庫", k: "sel", o: ["あり", "なし", "受注生産", "未確認"] },
  { id: "life", t: "賞味期限", k: "text" },
  { id: "mat", t: "原材料", k: "area" },
  { id: "eng", t: "英語表示", k: "sel", o: ["ある", "ない", "未確認"] },
  { id: "note", t: "備考", k: "area" },
];

export const PRODUCT_TAGS = {
  素材: ["木", "漆", "鉄", "紙", "土", "布"],
  用途: ["器", "道具", "装飾", "衣", "食"],
  状態: ["英語表示あり", "在庫あり", "小ロット可", "OEM可"],
  売り先: ["UMU向き", "Selfridges向き", "ギフト向き"],
};

// 一覧から詳細へ「開いた直後に何を出すか」を渡すための受け渡し口
let pendingOpen = null;

/* ---------- 小さな道具 ---------- */
function items(e) {
  const v = e.fields?.item;
  return Array.isArray(v) ? v : v ? [v] : [];
}
function isFood(e) {
  return items(e).some((x) => FOOD.includes(x));
}
function activeQs(e) {
  return MAKER_QS.filter((q) => !q.f || isFood(e));
}
function surveyQs(e) {
  return activeQs(e).filter((q) => q.q);
}
function valueOf(e, q) {
  if (q.id === "name") return e.name ? e.name : undefined;
  return e.fields?.[q.id];
}
function missing(e, list) {
  return list.filter((q) => valueOf(e, q) === undefined).length;
}
function display(q, v) {
  if (v === undefined) return "未回答";
  if (q.k === "mon") return v.length ? v.map((m) => `${m}月`).join(" ") : "繁忙期なし";
  if (Array.isArray(v)) return v.length ? v.join("・") : "（なし）";
  return v === "" ? "（空欄）" : v;
}
function groupsOf(list) {
  const gs = [];
  list.forEach((q) => { if (!gs.includes(q.g)) gs.push(q.g); });
  return gs;
}
function stageOfGroup(g) {
  const i = STAGES.findIndex((s) => s && s.en === g);
  return i > 0 ? STAGES[i] : null;
}
function fmtDate(key) {
  if (!key) return "日付なし";
  const [y, m, d] = key.split("-");
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}
function monthGrid(y, m) {
  const start = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MonthPicker({ value, onPick }) {
  const base = value ? value.split("-").map(Number) : null;
  const now = new Date();
  const [ym, setYm] = useState({ y: base ? base[0] : now.getFullYear(), m: base ? base[1] - 1 : now.getMonth() });
  const move = (step) => {
    const d = new Date(ym.y, ym.m + step, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };
  const key = (d) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <div className="bg-app-surface rounded-2xl border border-app-line p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => move(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" aria-label="前の月">
          <ChevronLeft size={18} className="text-ink-sub" />
        </button>
        <span className="text-sm font-semibold">{ym.y}年{ym.m + 1}月</span>
        <button onClick={() => move(1)} className="w-9 h-9 rounded-full flex items-center justify-center" aria-label="次の月">
          <ChevronRight size={18} className="text-ink-sub" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-ink-sub mb-1">
        {["日", "月", "火", "水", "木", "金", "土"].map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {monthGrid(ym.y, ym.m).map((d, i) =>
          d ? (
            <button
              key={i}
              onClick={() => onPick(key(d))}
              style={{ touchAction: "manipulation" }}
              className={`mx-auto w-9 h-9 rounded-full text-sm ${value === key(d) ? "bg-emerald-600 text-white font-semibold" : "text-ink"}`}
            >
              {d}
            </button>
          ) : (
            <div key={i} />
          )
        )}
      </div>
    </div>
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- 入力部品(アンケート・一問編集・商品で共用) ---------- */
function FieldInput({ q, draft, setDraft, onPick, onSave, saveLabel }) {
  const optBase = "w-full text-left px-4 py-3.5 mb-2 rounded-xl border text-[15px] active:scale-[0.98] transition-transform";
  const optOn = "border-emerald-600 bg-emerald-50 text-emerald-700 font-semibold";
  const optOff = "border-app-line bg-app-bg text-ink";

  if (q.k === "text" || q.k === "area") {
    const common = {
      autoFocus: true,
      value: draft ?? "",
      onChange: (e) => setDraft(e.target.value),
      className: "w-full border border-app-line rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-emerald-500 bg-app-bg",
    };
    return (
      <div>
        {q.k === "text" ? <input {...common} /> : <textarea rows={5} {...common} />}
        {onSave && (
          <button onClick={onSave} className="w-full mt-3 bg-emerald-600 text-white font-semibold rounded-xl py-3 text-[15px]">
            {saveLabel}
          </button>
        )}
      </div>
    );
  }

  if (q.k === "sel" || q.k === "tri") {
    const opts = q.k === "tri" ? ["○", "△", "×"] : q.o;
    return (
      <div>
        {opts.map((o) => (
          <button key={o} onClick={() => onPick(o)} className={`${optBase} ${draft === o ? optOn : optOff}`}>
            {o}
          </button>
        ))}
      </div>
    );
  }

  if (q.k === "multi") {
    const cur = Array.isArray(draft) ? draft : draft ? [draft] : [];
    const toggle = (o) => setDraft(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
    return (
      <div>
        {q.o.map((o) => (
          <button key={o} onClick={() => toggle(o)} className={`${optBase} ${cur.includes(o) ? optOn : optOff}`}>
            {o}
          </button>
        ))}
        {onSave && (
          <button onClick={onSave} className="w-full mt-1 bg-emerald-600 text-white font-semibold rounded-xl py-3 text-[15px]">
            {saveLabel}
          </button>
        )}
      </div>
    );
  }

  if (q.k === "mon") {
    const cur = Array.isArray(draft) ? draft : [];
    const toggle = (m) => setDraft(cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
    return (
      <div>
        <div className="grid grid-cols-4 gap-2">
          {MONTHS.map((m) => (
            <button
              key={m}
              onClick={() => toggle(m)}
              style={{ touchAction: "manipulation" }}
              className={`py-3.5 rounded-xl border text-base ${cur.includes(m) ? optOn : optOff}`}
            >
              {m}
            </button>
          ))}
        </div>
        {onSave && (
          <button onClick={onSave} className="w-full mt-4 bg-emerald-600 text-white font-semibold rounded-xl py-3 text-[15px]">
            {saveLabel}
          </button>
        )}
      </div>
    );
  }
  return null;
}

function sortMonths(v) {
  return Array.isArray(v) ? [...v].sort((a, b) => a - b) : v;
}
function orderMulti(q, v) {
  if (q.k === "multi" && Array.isArray(v)) return q.o.filter((o) => v.includes(o));
  if (q.k === "mon") return sortMonths(v);
  if (typeof v === "string") return v.trim();
  return v;
}

/* ---------- 一問分の画面(アンケートと一問編集で共用) ---------- */
function QuestionPane({ entry, q, mode, index, total, onAnswer, onSkip, onBack, onStop, onClear, onNextMissing }) {
  const current = valueOf(entry, q);
  const [draft, setDraft] = useState(current === undefined ? (q.k === "multi" || q.k === "mon" ? [] : "") : current);
  const [touched, setTouched] = useState(false);
  const set = (v) => { setDraft(v); setTouched(true); };
  const commit = () => {
    if (!touched) return false;
    onAnswer(orderMulti(q, draft));
    return true;
  };

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="px-5 pt-14">
        <div className="flex items-center gap-2 mb-2">
          {mode === "edit" && (
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="カードへ戻る">
              <ChevronLeft size={18} className="text-ink-sub" />
            </button>
          )}
          <span className="flex-1 text-sm text-ink-sub truncate">{entry.name || "無題"}</span>
          {mode === "survey" && <span className="text-sm text-ink-sub">{index}/{total}</span>}
        </div>
        {mode === "survey" && (
          <div className="h-[3px] bg-app-raised rounded-full mb-6">
            <div className="h-[3px] bg-emerald-600 rounded-full" style={{ width: `${(index / total) * 100}%` }} />
          </div>
        )}
        <div className="text-xs text-ink-sub mb-1.5">{q.g}</div>
        <h2 className="text-xl font-bold text-ink mb-3">{q.t}</h2>

        {mode === "survey" && (
          <div className="flex gap-2 mb-4">
            <button onClick={onBack} className="flex-1 py-3 rounded-xl border border-app-line bg-app-bg font-semibold tracking-wider text-sm">BACK</button>
            <button onClick={() => { if (!commit()) onSkip(); }} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold tracking-wider text-sm">NEXT</button>
            <button onClick={() => { commit(); onStop(); }} className="flex-1 py-3 rounded-xl border border-app-line bg-app-bg font-semibold tracking-wider text-sm">STOP</button>
          </div>
        )}

        <div className="pb-32">
          <FieldInput
            q={q}
            draft={draft}
            setDraft={set}
            onPick={(o) => onAnswer(o)}
            onSave={mode === "edit" ? () => onAnswer(orderMulti(q, draft)) : null}
            saveLabel="保存"
          />
        </div>
      </div>

      {mode === "edit" && (
        <div className="fixed bottom-0 inset-x-0 bg-app-bg border-t border-app-line px-5 pt-3 pb-8 flex gap-2">
          <button onClick={onClear} className="flex-1 py-3 rounded-xl border border-app-line text-sm">未回答に戻す</button>
          <button onClick={onNextMissing} className="flex-1 py-3 rounded-xl border border-app-line text-sm">次の未回答へ</button>
        </div>
      )}
    </div>
  );
}

/* ---------- 下から出る一問編集(商品の項目用) ---------- */
function FieldSheet({ q, value, onClose, onSave }) {
  const [draft, setDraft] = useState(value === undefined ? "" : value);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div className="bg-app-surface w-full max-w-md rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink">{q.t}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-app-raised flex items-center justify-center" aria-label="閉じる">
            <X size={16} className="text-ink-sub" />
          </button>
        </div>
        <FieldInput
          q={q}
          draft={draft}
          setDraft={setDraft}
          onPick={(o) => onSave(o)}
          onSave={() => onSave(typeof draft === "string" ? draft.trim() : draft)}
          saveLabel="保存"
        />
      </div>
    </div>
  );
}

/* =========================================================================
   一覧(WA NO KATA の「作り手」タブの中身)
   ========================================================================= */
export function MakerList({ onOpenEntry }) {
  const { entries, addEntry } = useSukima();
  const makers = useMemo(
    () => entries.filter((e) => e.type === "maker").sort((a, b) => b.updatedAt - a.updatedAt),
    [entries]
  );
  const [flt, setFlt] = useState(null); // null | 1..5 | "stop"
  const [name, setName] = useState("");
  const [overlay, setOverlay] = useState(null); // null | "find"

  useEffect(() => {
    let y = 0;
    try { y = Number(sessionStorage.getItem("maker-list-scroll") || 0); } catch { /* noop */ }
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);
  const open = (id) => {
    try { sessionStorage.setItem("maker-list-scroll", String(window.scrollY)); } catch { /* noop */ }
    onOpenEntry(id);
  };

  const counts = [1, 2, 3, 4, 5].map((s) => makers.filter((m) => (m.stage || 1) === s && !m.stop).length);
  const stoppedCount = makers.filter((m) => m.stop).length;
  const shown = makers.filter((m) => {
    if (flt === "stop") return !!m.stop;
    if (flt) return (m.stage || 1) === flt && !m.stop;
    return true;
  });

  function create() {
    const v = name.trim();
    if (!v) return;
    const id = addEntry("maker", v);
    setName("");
    pendingOpen = { id, screen: "survey" };
    onOpenEntry(id);
  }

  return (
    <>
      <div className="px-5 flex gap-2 mb-3">
        <button onClick={() => setOverlay("find")} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-app-raised text-sm text-ink-sub">
          <Search size={15} /> 商品を探す
        </button>
      </div>

      <div className="px-5 flex gap-1.5 mb-2">
        {STAGES.slice(1).map((s, i) => {
          const on = flt === i + 1;
          return (
            <button
              key={s.en}
              onClick={() => setFlt(on ? null : i + 1)}
              className={`flex-1 py-2 rounded-xl border text-center ${on ? "border-emerald-600 bg-emerald-50" : "border-app-line bg-app-surface"}`}
            >
              <div className={`text-lg font-bold ${on ? "text-emerald-700" : "text-ink"}`}>{counts[i]}</div>
              <div className="text-[9px] tracking-wide text-ink-sub">{s.en}</div>
            </button>
          );
        })}
      </div>
      <div className="px-5 flex items-center justify-end mb-4 min-h-[8px]">
        {stoppedCount > 0 && (
          <button
            onClick={() => setFlt(flt === "stop" ? null : "stop")}
            className={`text-xs px-3 py-1 rounded-full border ${flt === "stop" ? "border-red-400 bg-red-50 text-red-600" : "border-app-line text-ink-sub"}`}
          >
            止まった {stoppedCount}
          </button>
        )}
      </div>

      <main className="px-5 pb-40">
        {shown.length === 0 ? (
          <div className="mt-12 text-center text-sm text-ink-sub">
            まだいません
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {shown.map((e) => (
              <button
                key={e.id}
                onClick={() => open(e.id)}
                className="w-full text-left bg-app-surface rounded-2xl border border-app-line p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
              >
                <div
                  className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm rounded-xl"
                  style={{ background: "linear-gradient(135deg,#b07a3c,#8a5a26)" }}
                >
                  {e.name ? e.name.slice(0, 2) : "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-ink truncate">{e.name || "無題"}</span>
                    {e.stop ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 flex-shrink-0">止まった</span>
                    ) : (
                      <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex-shrink-0">
                        {STAGES[e.stage || 1].en}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-sub mt-0.5 truncate">
                    {items(e).join("・") || "品目 未回答"} ・ 未回答 {missing(e, surveyQs(e))} ・ 商品 {(e.products || []).length}
                  </div>
                </div>
                <ChevronRight size={16} className="text-ink-sub/70 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-app-bg border-t border-app-line px-5 pt-3 pb-8">
        <div className="flex gap-2 max-w-md mx-auto pr-12">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) create(); }}
            placeholder="名前を入れて保存"
            className="flex-1 border border-app-line rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={create}
            disabled={!name.trim()}
            className="bg-emerald-600 disabled:bg-app-raised disabled:text-ink-sub text-white font-semibold rounded-xl px-4 text-[15px]"
          >
            追加
          </button>
        </div>
      </div>

      {overlay === "find" && <ProductFinder makers={makers} onClose={() => setOverlay(null)} onOpen={(id, pid) => { pendingOpen = { id, screen: "product", pid }; onOpenEntry(id); }} />}
    </>
  );
}

/* ---------- 商品の横断検索 ---------- */
function ProductFinder({ makers, onClose, onOpen }) {
  const [kw, setKw] = useState("");
  const allTags = Object.values(PRODUCT_TAGS).flat();
  const hits = [];
  makers.forEach((m) =>
    (m.products || []).forEach((p) => {
      const hay = [p.n, p.kind, p.size, p.retail, p.note, p.mat, ...(p.tg || []), m.name, m.fields?.area, items(m).join(" ")].join(" ");
      if (!kw.trim() || hay.includes(kw.trim())) hits.push({ m, p });
    })
  );
  return (
    <div className="fixed inset-0 z-40 bg-app-bg overflow-y-auto">
      <div className="px-5 pt-14 pb-10 max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="閉じる">
            <ChevronLeft size={18} className="text-ink-sub" />
          </button>
          <h2 className="text-xl font-bold flex-1">商品を探す</h2>
        </div>
        <div className="flex items-center gap-2 bg-app-raised rounded-xl px-3 py-2.5 mb-3">
          <Search size={15} className="text-ink-sub" />
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="タグ・商品名・産地" className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-ink-sub" />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setKw(kw === t ? "" : t)}
              className={`text-xs px-3 py-1.5 rounded-full border ${kw === t ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-semibold" : "border-app-line text-ink-sub"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="text-xs text-ink-sub mb-2">{hits.length}件</div>
        <div className="flex flex-col gap-2.5">
          {hits.map(({ m, p }) => (
            <button key={p.id} onClick={() => onOpen(m.id, p.id)} className="w-full text-left bg-app-surface rounded-2xl border border-app-line p-4">
              <div className="flex items-center">
                <span className="text-[15px] font-bold flex-1">{p.n || "無題"}</span>
                <ChevronRight size={16} className="text-ink-sub/70" />
              </div>
              <div className="text-xs text-ink-sub mt-0.5">{m.name}{m.fields?.area ? ` ・ ${m.fields.area}` : ""}</div>
              {(p.tg || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.tg.map((t) => (
                    <span key={t} className="text-[10px] text-ink-sub bg-app-raised px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   詳細(カード・アンケート・一問編集・商品)
   ========================================================================= */
export function MakerDetail({ entryId, onBack }) {
  const { getEntry, updateEntry, updateField, clearField, deleteEntry } = useSukima();
  const dataCtx = useData();
  const entry = getEntry(entryId);

  const [view, setViewRaw] = useState(() => {
    const p = pendingOpen && pendingOpen.id === entryId ? pendingOpen : null;
    pendingOpen = null;
    if (p?.screen === "survey") return { s: "survey", qi: 1 };
    if (p?.screen === "product") return { s: "product", pid: p.pid };
    return { s: "card" };
  });
  const [sheet, setSheet] = useState(null); // 商品項目の編集 { pid, fid } / 止まった印 "stop"
  const [dateOpen, setDateOpen] = useState(false);

  // 編集して戻った時に、カードの同じ位置に戻す(トップへ飛ばない)
  const scrollMemo = useRef({});
  const setView = (next) => {
    scrollMemo.current[view.s] = window.scrollY;
    setViewRaw(next);
  };
  useEffect(() => {
    const keep = view.s === "card" || view.s === "products";
    const y = keep ? scrollMemo.current[view.s] || 0 : 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [view.s, view.qid, view.qi, view.pid]);

  const back = () => {
    if (view.s === "card") onBack();
    else if (view.s === "product") setView({ s: "products" });
    else setView({ s: "card" });
  };
  useSwipeBack(back);

  if (!entry) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-sub text-sm">
        見つかりません <button onClick={onBack} className="ml-2 text-emerald-600">戻る</button>
      </div>
    );
  }

  const act = activeQs(entry);
  const save = (q, v) => {
    if (q.id === "name") updateEntry(entry.id, { name: v });
    else updateField(entry.id, q.id, v);
  };
  const clear = (q) => {
    if (q.id === "name") updateEntry(entry.id, { name: "" });
    else clearField(entry.id, q.id);
  };

  /* ---- アンケート ---- */
  if (view.s === "survey") {
    const list = surveyQs(entry);
    const q = list[view.qi];
    if (!q) {
      setTimeout(() => setView({ s: "card" }), 0);
      return null;
    }
    const next = () => setView({ s: "survey", qi: view.qi + 1 });
    return (
      <QuestionPane
        key={`s-${q.id}`}
        entry={entry}
        q={q}
        mode="survey"
        index={view.qi}
        total={list.length}
        onAnswer={(v) => { save(q, v); next(); }}
        onSkip={next}
        onBack={() => (view.qi > 0 ? setView({ s: "survey", qi: view.qi - 1 }) : setView({ s: "card" }))}
        onStop={() => setView({ s: "card" })}
      />
    );
  }

  /* ---- 一問だけ ---- */
  if (view.s === "one") {
    const q = MAKER_QS.find((x) => x.id === view.qid);
    const toCard = () => setView({ s: "card" });
    return (
      <QuestionPane
        key={`o-${q.id}`}
        entry={entry}
        q={q}
        mode="edit"
        onAnswer={(v) => { save(q, v); toCard(); }}
        onBack={toCard}
        onClear={() => { clear(q); toCard(); }}
        onNextMissing={() => {
          const i = act.findIndex((x) => x.id === q.id);
          const n = act.slice(i + 1).find((x) => valueOf(entry, x) === undefined) || act.find((x) => x.id !== q.id && valueOf(entry, x) === undefined);
          if (n) setView({ s: "one", qid: n.id });
          else toCard();
        }}
      />
    );
  }

  /* ---- 商品一覧 ---- */
  if (view.s === "products") {
    const products = entry.products || [];
    function addProduct() {
      const p = { id: uid(), n: "", tg: [], driveFolderId: "", driveFiles: [] };
      updateEntry(entry.id, { products: [...products, p] });
      setView({ s: "product", pid: p.id });
    }
    return (
      <div className="min-h-screen bg-app-bg">
        <header className="px-5 pt-14 pb-3 flex items-center gap-2">
          <button onClick={back} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="カードへ戻る">
            <ChevronLeft size={18} className="text-ink-sub" />
          </button>
          <h1 className="text-xl font-bold flex-1 truncate">{entry.name || "無題"} の商品</h1>
          <span className="text-sm text-ink-sub">{products.length}件</span>
        </header>
        <main className="px-5 pb-32 flex flex-col gap-2.5">
          {products.length === 0 && <div className="mt-12 text-center text-sm text-ink-sub">まだありません</div>}
          {products.map((p) => (
            <button key={p.id} onClick={() => setView({ s: "product", pid: p.id })} className="w-full text-left bg-app-surface rounded-2xl border border-app-line p-4">
              <div className="flex items-center">
                <span className="text-[15px] font-bold flex-1">{p.n || "無題"}</span>
                <ChevronRight size={16} className="text-ink-sub/70" />
              </div>
              <div className="text-xs text-ink-sub mt-0.5">{[p.size, p.retail, p.lot].filter(Boolean).join(" ・ ")}</div>
              {(p.tg || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.tg.map((t) => (
                    <span key={t} className="text-[10px] text-ink-sub bg-app-raised px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </main>
        <div className="fixed bottom-0 inset-x-0 bg-app-bg border-t border-app-line px-5 pt-3 pb-8">
          <button onClick={addProduct} className="w-full max-w-md mx-auto block bg-emerald-600 text-white font-semibold rounded-xl py-3 text-[15px]">
            商品を追加
          </button>
        </div>
      </div>
    );
  }

  /* ---- 商品1件 ---- */
  if (view.s === "product") {
    const products = entry.products || [];
    const p = products.find((x) => x.id === view.pid);
    if (!p) {
      setTimeout(() => setView({ s: "products" }), 0);
      return null;
    }
    const patch = (obj) => updateEntry(entry.id, { products: products.map((x) => (x.id === p.id ? { ...x, ...obj } : x)) });
    const toggleTag = (t) => patch({ tg: (p.tg || []).includes(t) ? p.tg.filter((x) => x !== t) : [...(p.tg || []), t] });
    return (
      <div className="min-h-screen bg-app-bg">
        <header className="px-5 pt-14 pb-3 flex items-center gap-2">
          <button onClick={back} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="商品一覧へ戻る">
            <ChevronLeft size={18} className="text-ink-sub" />
          </button>
          <h1 className="text-xl font-bold flex-1 truncate">{p.n || "新しい商品"}</h1>
          <button
            onClick={() => {
              if (window.confirm("この商品を消しますか")) {
                updateEntry(entry.id, { products: products.filter((x) => x.id !== p.id) });
                setView({ s: "products" });
              }
            }}
            className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center"
            aria-label="商品を削除"
          >
            <Trash2 size={16} className="text-red-500" />
          </button>
        </header>
        <main className="px-5 pb-16">
          <div className="mb-4">
            <DriveGallery
              entityId={p.id}
              entityName={`${entry.name || "無題"}｜${p.n || "商品"}`}
              appFolderName="Sukima"
              driveFolderId={p.driveFolderId || ""}
              driveFiles={p.driveFiles || []}
              onFolderId={(id) => patch({ driveFolderId: id })}
              onFilesChange={(files) => patch({ driveFiles: files })}
              accentColor="#279a63"
            />
          </div>
          <div className="bg-app-surface rounded-2xl border border-app-line p-1.5 mb-4">
            {PRODUCT_FIELDS.map((f) => {
              const v = p[f.id];
              const empty = v === undefined || v === "";
              return (
                <button key={f.id} onClick={() => setSheet({ pid: p.id, fid: f.id })} className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl text-left ${empty ? "bg-app-raised/60" : ""}`}>
                  <span className="text-[13px] text-ink-sub w-[42%] flex-shrink-0">{f.t}</span>
                  <span className={`flex-1 text-right text-sm break-words ${empty ? "text-ink-sub" : "text-ink"}`}>{empty ? "未記入" : v}</span>
                  <ChevronRight size={15} className="text-ink-sub/60 flex-shrink-0" />
                </button>
              );
            })}
          </div>
          <div className="bg-app-surface rounded-2xl border border-app-line p-4">
            <div className="text-sm font-bold mb-3">タグ</div>
            {Object.entries(PRODUCT_TAGS).map(([k, list]) => (
              <div key={k} className="mb-3">
                <div className="text-xs text-ink-sub mb-1.5">{k}</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((t) => {
                    const on = (p.tg || []).includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        style={{ touchAction: "manipulation" }}
                        className={`text-xs px-3 py-1.5 rounded-full border ${on ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-semibold" : "border-app-line text-ink-sub bg-app-bg"}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </main>
        {sheet && sheet.pid === p.id && (
          <FieldSheet
            q={PRODUCT_FIELDS.find((f) => f.id === sheet.fid)}
            value={p[sheet.fid]}
            onClose={() => setSheet(null)}
            onSave={(v) => { patch({ [sheet.fid]: v }); setSheet(null); }}
          />
        )}
      </div>
    );
  }

  /* ---- カード ---- */
  const stage = entry.stage || 1;
  const gs = groupsOf(act);
  const dayEvents = (dataCtx?.data?.events || []).filter((ev) => ev.date === entry.metDate);
  const warn = stage >= 5 && entry.fields?.kday !== undefined && entry.fields?.kvol === undefined;

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="px-5 pt-14 pb-3 flex items-center gap-2">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="一覧へ戻る">
          <ChevronLeft size={18} className="text-ink-sub" />
        </button>
        <h1 className="text-2xl font-bold flex-1 truncate">{entry.name || "無題"}</h1>
        <button onClick={() => setSheet("stop")} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="止まった印">
          <MinusCircle size={18} className={entry.stop ? "text-red-500" : "text-ink-sub"} />
        </button>
      </header>

      <main className="px-5 pb-16">
        {entry.stop && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 mb-3">
            <div className="text-sm font-semibold text-red-600">止まっています</div>
            <div className="text-xs text-red-600 mt-0.5">{entry.stop.reason || "理由は未記入"}</div>
          </div>
        )}

        <div className="flex gap-1.5 mb-2">
          {STAGES.slice(1).map((s, i) => {
            const n = i + 1;
            const cls = stage === n ? "bg-emerald-600 border-emerald-600 text-white" : stage > n ? "bg-app-bg border-app-line text-ink-sub" : "bg-app-bg border-app-line text-ink-sub opacity-50";
            return (
              <button key={s.en} onClick={() => updateEntry(entry.id, { stage: n })} className={`flex-1 py-2.5 rounded-xl border text-[10px] font-semibold tracking-wide ${cls}`}>
                {s.en}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mb-3 text-xs text-ink-sub min-w-0">
          <button
            onClick={() => setDateOpen(!dateOpen)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg border ${dateOpen ? "border-emerald-600 text-emerald-700" : "border-app-line text-ink"} bg-app-bg`}
            aria-label="会った日"
          >
            {fmtDate(entry.metDate)}
          </button>
          {dayEvents.length > 0 && <span className="truncate">{dayEvents.map((ev) => ev.title).join("／")}</span>}
        </div>
        {dateOpen && (
          <MonthPicker
            value={entry.metDate}
            onPick={(k) => { updateEntry(entry.id, { metDate: k }); setDateOpen(false); }}
          />
        )}

        {warn && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 mb-3 text-sm text-red-600">
            契約日が入っていますが、販売数量の取り決めが未記入です
          </div>
        )}

        <div className="mb-4">
          <DriveGallery
            entityId={entry.id}
            entityName={entry.name || "無題"}
            appFolderName="Sukima"
            driveFolderId={entry.driveFolderId}
            driveFiles={entry.driveFiles}
            onFolderId={(id) => updateEntry(entry.id, { driveFolderId: id })}
            onFilesChange={(files) => updateEntry(entry.id, { driveFiles: files })}
            accentColor="#279a63"
          />
        </div>

        <button onClick={() => setView({ s: "survey", qi: 1 })} className="w-full mb-4 py-3 rounded-xl border border-app-line bg-app-bg text-sm font-semibold">
          アンケート
        </button>

        {gs.map((g) => {
          const fs = act.filter((q) => q.g === g);
          const dim = fs[0].s > stage;
          const m = missing(entry, fs);
          return (
            <div key={g} className={`bg-app-surface rounded-2xl border border-app-line mb-3 overflow-hidden ${dim ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-bold">
                  {g}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {m ? `未回答 ${m}` : "完了"}
                </span>
              </div>
              <div className="px-1.5 pb-2">
                {fs.map((q) => {
                  const v = valueOf(entry, q);
                  const un = v === undefined;
                  return (
                    <button key={q.id} onClick={() => setView({ s: "one", qid: q.id })} className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl text-left ${un ? "bg-app-raised/60" : ""}`}>
                      <span className="text-[13px] text-ink-sub w-[42%] flex-shrink-0">{q.t}</span>
                      <span className={`flex-1 text-right text-sm break-words ${un ? (q.warn ? "text-red-500" : "text-ink-sub") : "text-ink"}`}>{display(q, v)}</span>
                      <ChevronRight size={15} className="text-ink-sub/60 flex-shrink-0" />
                    </button>
                  );
                })}
                {g === "SEARCH" && (
                  <div className="flex items-center justify-between mx-2 mt-1.5 pt-2.5 border-t border-app-line">
                    <span className="text-sm font-semibold">商品 {(entry.products || []).length}件</span>
                    <button onClick={() => setView({ s: "products" })} className="text-sm px-4 py-1.5 rounded-xl border border-app-line bg-app-bg">
                      開く
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => {
            if (window.confirm(`「${entry.name || "無題"}」を削除しますか`)) {
              deleteEntry(entry.id);
              onBack();
            }
          }}
          className="w-full mt-6 py-3 rounded-xl text-sm text-red-500 flex items-center justify-center gap-1.5"
        >
          <Trash2 size={15} /> この作り手を削除
        </button>
      </main>

      {sheet === "stop" && (
        <StopSheet
          stop={entry.stop}
          onClose={() => setSheet(null)}
          onSet={(reason) => { updateEntry(entry.id, { stop: { reason, at: Date.now() } }); setSheet(null); }}
          onClear={() => { updateEntry(entry.id, { stop: null }); setSheet(null); }}
        />
      )}
    </div>
  );
}

function StopSheet({ stop, onClose, onSet, onClear }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30" onClick={onClose}>
      <div className="bg-app-surface w-full max-w-md rounded-t-3xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink">{stop ? "止まった印を外す" : "止まった印を付ける"}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-app-raised flex items-center justify-center" aria-label="閉じる">
            <X size={16} className="text-ink-sub" />
          </button>
        </div>
        {stop ? (
          <>
            <p className="text-sm text-ink-sub mb-4">{stop.reason || "理由は未記入"}</p>
            <button onClick={onClear} className="w-full border border-app-line rounded-xl py-3 text-[15px]">印を外す</button>
          </>
        ) : (
          <>
            <div className="text-xs text-ink-sub mb-2">止まった理由</div>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="他社が入っていた／返事が来ない／値段が合わない"
              className="w-full border border-app-line rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-emerald-500"
            />
            <button onClick={() => onSet(reason.trim())} className="w-full mt-3 bg-emerald-600 text-white font-semibold rounded-xl py-3 text-[15px]">
              印を付ける
            </button>
          </>
        )}
      </div>
    </div>
  );
}
