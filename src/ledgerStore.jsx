import { createContext, useContext, useEffect, useRef, useState } from "react";
import { reconcileOnStartup, saveCloud } from "./cloudSync";
import { scheduleAutoBackup } from "./driveAutoBackup";
import { backupNamedDataToDrive } from "./googleDrive";

/**
 * Ledger（酒類台帳）のデータ管理。
 *
 * 酒税法の記帳義務に対応するための帳簿。品名・容量ごとに仕入・販売を記録する。
 * 定価と卸価格は小林醸造との取り決めで固定のため、商品マスタに持たせ、
 * 個々の仕入・販売行では編集させない。
 *
 * 保存先はこのブラウザのlocalStorage。Daily Brainsのクラウド保存とは
 * 別の独立したアプリのため、今はここに閉じている。
 */

const STORAGE_KEY = "ledger-data-v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ラベル写真は端末内(localStorage)にbase64のまま持つ。Driveとは連携せず、
// このアプリの中だけで完結させる方針のため、圧縮して容量を抑える。
export function compressPhoto(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    products: [],   // { id, name, volumeMl, abv, polish, rice, brewery, origin,
                     //   retailPrice, wholesalePrice, pairing: [], photo: null, docs: [] }
    purchases: [],  // { id, productId, date, qty, amount, charges: [] }
    sales: [],      // { id, productId, date, qty, amount, charges: [] }
                     // charges: [{ id, type: "shipping"|"parking"|"other", amount, note }]
                     //   送料・駐車場代など酒以外の費用(税込)。仕入は自分が払った分、
                     //   販売はお客さんから受け取った分。酒の金額(amount)とは混ぜない。
    stockCounts: {}, // { [productId]: { count, note } } — 直近の実地棚卸
    costs: [],       // { id, date, type: "shipping"|"parking"|"other", amount, note }
                     //   仕入にかかった送料・駐車場代など(税込)。商品ごとではなく日ごとに持つ。
  };
}

// 商品番号。登録順の連番で、一度付けた番号は変えず、消しても詰めない。
// nextProductNo に次に使う番号を持つ。番号の無い商品(以前のデータ)は、
// 並び順(=登録順)のまま、今ある最大の番号の続きから付ける。
function withProductNos(d) {
  if (!d || !Array.isArray(d.products)) return d;
  let max = d.products.reduce((m, p) => Math.max(m, Number(p.no) || 0), 0);
  let next = Math.max(Number(d.nextProductNo) || 0, max + 1);
  let changed = false;
  const products = d.products.map((p) => {
    if (Number(p.no) > 0) return p;
    changed = true;
    return { ...p, no: next++ };
  });
  if (!changed && Number(d.nextProductNo) === next) return d;
  return { ...d, products, nextProductNo: next };
}

// 以前は仕入の記録ごとに送料などを持っていた(charges)。仕入側は日ごとの
// costs に移したので、残っていれば同じ日付で costs へ移し、記録からは外す。
function withCostsMoved(d) {
  if (!d || !Array.isArray(d.purchases)) return d;
  const costs = Array.isArray(d.costs) ? d.costs : [];
  const moved = [];
  const purchases = d.purchases.map((x) => {
    if (!Array.isArray(x.charges) || x.charges.length === 0) return x;
    x.charges.forEach((c) => moved.push({ id: c.id || uid(), date: x.date, type: c.type, amount: Number(c.amount) || 0, ...(c.note ? { note: c.note } : {}) }));
    const { charges, ...rest } = x;
    return rest;
  });
  if (moved.length === 0 && Array.isArray(d.costs)) return d;
  return { ...d, purchases, costs: [...costs, ...moved] };
}
function normalize(d) {
  return withCostsMoved(withProductNos(d));
}

const LedgerContext = createContext(null);

// クラウドが空かどうかの判定。商品が1件も無ければ「空」とみなす
// (仕入・販売だけあって商品が無い状態は通常起きないため、これで足りる)。
function isEmpty(d) {
  return !d || !Array.isArray(d.products) || d.products.length === 0;
}

export function LedgerProvider({ children }) {
  const [data, setData] = useState(() => normalize(loadData()));
  const hydrated = useRef(false); // 起動時のクラウド照合が終わるまで、上書き保存を待つ

  // 起動時、クラウドと端末内のデータを照合する。他の端末で更新していれば
  // それを取り込み、クラウドがまだ空(初回)なら端末内のデータをそのまま
  // アップロードして守る(Daily Brains/Sukimaと同じ仕組み)。
  useEffect(() => {
    reconcileOnStartup("ledger", loadData(), isEmpty).then((resolved) => {
      setData(normalize(resolved));
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    // 起動直後、まだクラウドと照合していない状態でここに来ると、
    // 初期値(空)をクラウドへ送って他端末のデータを消しかねないため待つ。
    if (!hydrated.current) return;
    saveCloud("ledger", data).catch(() => {});
    // 他のアプリと同じくDriveにも出す。D1だけだと復元先が一つしか無い。
    scheduleAutoBackup("ledger", data, (d) =>
      backupNamedDataToDrive("ledger-backup.json", "hibi-drive-ledger-file-id", d)
    );
  }, [data]);

  // バックアップから丸ごと戻す。足りない項目は初期値で埋める。
  function replaceAllData(restored) {
    setData(normalize({
      products: [], purchases: [], sales: [], stockCounts: {}, costs: [],
      ...(restored || {}),
    }));
  }

  // ---- 商品マスタ ----
  function addProduct(p) {
    // photoFront/photoBack: ラベルの表・裏。photoは古い形の名残で使っていない。
    const id = uid();
    setData((prev) => {
      const no = Number(prev.nextProductNo) || 1;
      const product = { id, pairing: [], docs: [], photoFront: null, photoBack: null, ...p, no };
      return { ...prev, products: [...prev.products, product], nextProductNo: no + 1 };
    });
    return id;
  }
  function updateProduct(id, patch) {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }
  function deleteProduct(id) {
    setData((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
      purchases: prev.purchases.filter((x) => x.productId !== id),
      sales: prev.sales.filter((x) => x.productId !== id),
    }));
  }

  // ---- 仕入 ----
  function addPurchase(productId, entry) {
    setData((prev) => ({
      ...prev,
      purchases: [...prev.purchases, { id: uid(), productId, ...entry }],
    }));
  }
  function updatePurchase(id, patch) {
    setData((prev) => ({
      ...prev,
      purchases: prev.purchases.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }
  function deletePurchase(id) {
    setData((prev) => ({ ...prev, purchases: prev.purchases.filter((x) => x.id !== id) }));
  }

  // ---- 販売 ----
  function addSale(productId, entry) {
    setData((prev) => ({
      ...prev,
      sales: [...prev.sales, { id: uid(), productId, ...entry }],
    }));
  }
  function updateSale(id, patch) {
    setData((prev) => ({
      ...prev,
      sales: prev.sales.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }
  function deleteSale(id) {
    setData((prev) => ({ ...prev, sales: prev.sales.filter((x) => x.id !== id) }));
  }

  // ---- 仕入の送料・駐車場代など ----
  function addCost(c) {
    setData((prev) => ({ ...prev, costs: [...(prev.costs || []), { id: uid(), ...c }] }));
  }
  function updateCost(id, patch) {
    setData((prev) => ({ ...prev, costs: (prev.costs || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }
  function deleteCost(id) {
    setData((prev) => ({ ...prev, costs: (prev.costs || []).filter((x) => x.id !== id) }));
  }

  // ---- 実地棚卸 ----
  function setStockCount(productId, count, note) {
    setData((prev) => ({
      ...prev,
      stockCounts: { ...prev.stockCounts, [productId]: { count, note: note || "" } },
    }));
  }

  const value = {
    data,
    addProduct, updateProduct, deleteProduct,
    addPurchase, updatePurchase, deletePurchase,
    addSale, updateSale, deleteSale,
    setStockCount,
    addCost, updateCost, deleteCost,
    replaceAllData,
  };

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within LedgerProvider");
  return ctx;
}

// ---- 集計のための共通ヘルパー ----

export function monthKey(dateStr) {
  return (dateStr || "").slice(0, 7); // "YYYY-MM"
}

export function sumQty(entries, productId, month) {
  return entries
    .filter((e) => e.productId === productId && (!month || monthKey(e.date) === month))
    .reduce((s, e) => s + (e.qty || 0), 0);
}

// 試飲サンプル(無償で渡した分)だけ、または売った分だけを数える。
// 酒税法では無償譲渡を売上と分けて記帳するため、集計も分けられるようにする。
export function sumQtyWhere(entries, productId, pick, month) {
  return entries
    .filter((e) => e.productId === productId && pick(e) && (!month || monthKey(e.date) === month))
    .reduce((s, e) => s + (e.qty || 0), 0);
}

export const isSample = (e) => Boolean(e.sample);
export const notSample = (e) => !e.sample;

export function sumAmount(entries, productId, month) {
  return entries
    .filter((e) => e.productId === productId && (!month || monthKey(e.date) === month))
    .reduce((s, e) => s + (e.amount || 0), 0);
}

// 720ml等の表記からリットルを求める。手入力ゆれ(720、720ml、0.72L等)を吸収する。
export function toLiters(volumeMl, qty) {
  const ml = Number(volumeMl) || 0;
  return (ml * (qty || 0)) / 1000;
}

// ---- 送料・駐車場代など(酒以外の費用) ----
// 今までの記録には charges が無いので、無ければ空として読む。
export const CHARGE_TYPES = [
  { id: "shipping", label: "Shipping" },
  { id: "parking", label: "Parking" },
  { id: "other", label: "Other" },
];
export function chargeLabel(type) {
  return CHARGE_TYPES.find((t) => t.id === type)?.label || "Other";
}
export function chargesOf(e) {
  return Array.isArray(e?.charges) ? e.charges : [];
}
// 種類ごとの合計。month を渡せばその月だけ。
export function sumCharges(entries, type, month) {
  return entries
    .filter((e) => !month || monthKey(e.date) === month)
    .reduce((s, e) => s + chargesOf(e)
      .filter((c) => !type || c.type === type)
      .reduce((t, c) => t + (Number(c.amount) || 0), 0), 0);
}

// 画面に出す商品番号。2桁にそろえる(01, 02 …)。
export function productNo(p) {
  return Number(p?.no) > 0 ? String(p.no).padStart(2, "0") : "";
}

// 仕入の送料など。type を渡せばその種類だけ、year を渡せばその年だけ。
export function sumCosts(costs, type, year) {
  return (costs || [])
    .filter((c) => (!type || c.type === type) && (!year || (c.date || "").slice(0, 4) === year))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
}
