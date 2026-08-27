import { createContext, useContext, useEffect, useState } from "react";

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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    products: [],   // { id, name, volumeMl, abv, polish, rice, brewery, origin,
                     //   retailPrice, wholesalePrice, pairing: [], photo: null, docs: [] }
    purchases: [],  // { id, productId, date, qty, amount }
    sales: [],      // { id, productId, date, qty, amount }
    stockCounts: {}, // { [productId]: { count, note } } — 直近の実地棚卸
  };
}

const LedgerContext = createContext(null);

export function LedgerProvider({ children }) {
  const [data, setData] = useState(loadData);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [data]);

  // ---- 商品マスタ ----
  function addProduct(p) {
    const product = { id: uid(), pairing: [], docs: [], photo: null, ...p };
    setData((prev) => ({ ...prev, products: [...prev.products, product] }));
    return product.id;
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
  function deleteSale(id) {
    setData((prev) => ({ ...prev, sales: prev.sales.filter((x) => x.id !== id) }));
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
    addPurchase, deletePurchase,
    addSale, deleteSale,
    setStockCount,
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
