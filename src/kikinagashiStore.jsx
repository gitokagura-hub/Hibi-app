import { createContext, useContext, useState, useEffect, useRef } from "react";
import { reconcileOnStartup, saveCloud } from "./cloudSync";
import { scheduleAutoBackup } from "./driveAutoBackup";
import { backupNamedDataToDrive } from "./googleDrive";

/* =========================================================================
   聞き流し(英語学習)専用データストア。
   sukimaStore.jsx / timelessStore.jsx と同じパターン:
   - localStorageに即保存 + D1へクラウド同期(hydratedロックで空データ上書き防止)
   - Google Driveへも専用ファイルとして自動バックアップ
   これまでReaderPage.jsx内で直接localStorageのみに保存していたものを、
   他の機能(Sukima等)と同じ安全な保存パターンに揃えるために独立させた。
   ========================================================================= */

const STORAGE_KEY = "kikinagashi-items";
const LEGACY_STORAGE_KEY = "kikinagashi-list"; // 旧・textarea一括版のデータ(移行用)

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function splitLine(l) {
  const sep = l.includes("|") ? "|" : l.includes(",") ? "," : null;
  if (!sep) return { en: l.trim(), ja: "" };
  const idx = l.indexOf(sep);
  return { en: l.slice(0, idx).trim(), ja: l.slice(idx + 1).trim() };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 旧フォーマットは配列そのもの、新フォーマットは {items: [...]}
      const items = Array.isArray(parsed) ? parsed : parsed.items || [];
      // カテゴリー未設定の既存データは「未分類」として扱う(表示の後方互換)
      return {
        items: items.map((it) => ({ ...it, category: it.category || "未分類" })),
        words: Array.isArray(parsed.words) ? parsed.words : [],
      };
    }
  } catch {
    // noop
  }
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && legacy.trim()) {
      const items = legacy.split("\n").map((l) => l.trim()).filter(Boolean).map(splitLine)
        .map((it) => ({ id: makeId(), category: "未分類", ...it }));
      return { items, words: [] };
    }
  } catch {
    // noop
  }
  return { items: [], words: [] };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // noop
  }
}

const KikinagashiContext = createContext(null);

export function KikinagashiProvider({ children }) {
  const [data, setData] = useState(loadData);
  // データ保護ロック: クラウド照合が終わるまでは保存を発動させない
  // (2026-08-05 Sukima消失インシデントと同じ事故を避けるため)。
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const isEmpty = (d) =>
      !d ||
      ((!Array.isArray(d.items) || d.items.length === 0) &&
        (!Array.isArray(d.words) || d.words.length === 0));
    reconcileOnStartup("kikinagashi", data, isEmpty).then((result) => {
      if (!cancelled) {
        hydrated.current = true;
        if (JSON.stringify(result) !== JSON.stringify(data)) {
          setData(result);
        }
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveData(data);
    saveCloud("kikinagashi", data).catch(() => {});
    scheduleAutoBackup("kikinagashi", data, (d) => backupNamedDataToDrive("kikinagashi-backup.json", "hibi-drive-kikinagashi-file-id", d));
  }, [data]);

  function addItems(newItems) {
    const withIds = newItems.map((it) => ({ id: makeId(), category: "未分類", ...it }));
    setData((d) => ({ ...d, items: [...d.items, ...withIds] }));
    return withIds;
  }

  function addItem(en, ja, category) {
    const item = { id: makeId(), en: en.trim(), ja: (ja || "").trim(), category: category?.trim() || "未分類" };
    setData((d) => ({ ...d, items: [...d.items, item] }));
    return item;
  }

  function updateItem(id, patch) {
    setData((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  function deleteItem(id) {
    setData((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));
  }

  /* ---- 単語帳。フレーズ(items)とは別のリスト ---- */

  function addWord(en, ja, tags) {
    const word = {
      id: makeId(),
      en: (en || "").trim(),
      ja: (ja || "").trim(),
      tags: Array.isArray(tags) ? tags : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setData((d) => ({ ...d, words: [word, ...(d.words || [])] }));
    return word;
  }

  // 貼り付け取り込み。同じ単語があっても別件として足す。
  function addWords(list) {
    const now = Date.now();
    const made = list.map((w, i) => ({
      id: makeId() + i.toString(36),
      en: (w.en || "").trim(),
      ja: (w.ja || "").trim(),
      tags: [],
      createdAt: now - i, // 貼った順が保たれるように少しずらす
      updatedAt: now - i,
    }));
    setData((d) => ({ ...d, words: [...made, ...(d.words || [])] }));
    return made;
  }

  function updateWord(id, patch) {
    setData((d) => ({
      ...d,
      words: (d.words || []).map((w) => (w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w)),
    }));
  }

  function deleteWord(id) {
    setData((d) => ({ ...d, words: (d.words || []).filter((w) => w.id !== id) }));
  }

  // バックアップから丸ごと戻す。足りない項目は初期値で埋める。
  function replaceAllData(restored) {
    setData({ items: [], words: [], categories: [], ...(restored || {}) });
  }

  const value = {
    items: data.items,
    words: data.words || [],
    replaceAllData,
    addItems,
    addItem,
    updateItem,
    deleteItem,
    addWord,
    addWords,
    updateWord,
    deleteWord,
  };

  return <KikinagashiContext.Provider value={value}>{children}</KikinagashiContext.Provider>;
}

export function useKikinagashi() {
  const ctx = useContext(KikinagashiContext);
  if (!ctx) throw new Error("useKikinagashi must be used within KikinagashiProvider");
  return ctx;
}
