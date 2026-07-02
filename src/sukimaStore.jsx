import { createContext, useContext, useState, useEffect } from "react";

/* =========================================================================
   Sukima専用データストア
   Daily Brainsのdata store（dataStore.jsx）とは完全に独立。
   Sukimaは「Daily Brainsの中の1機能」ではなく「対等な別アプリ」という
   設計方針（Home直下の独立した枝）に合わせて、保存先も別キーにしている。
   ========================================================================= */

const STORAGE_KEY = "sukima-data-v1";

const GROUPS = [
  { code: "G1", title: "プロフィール" },
  { code: "G2", title: "思想" },
  { code: "G3", title: "ビジネス" },
  { code: "G4", title: "未来への応用" },
  { code: "G5", title: "資料・評価" },
];

// 15カードの定義（Sukima Design Brief v0.3 準拠）
const CARD_DEFS = [
  { key: "basicInfo", group: "G1", title: "基本情報", type: "text" },
  { key: "type", group: "G1", title: "タイプ", type: "tags" },
  { key: "career", group: "G1", title: "経歴", type: "text" },
  { key: "philosophy", group: "G2", title: "思想・哲学", type: "text" },
  { key: "companyInfo", group: "G3", title: "企業情報", type: "text" },
  { key: "businessModel", group: "G3", title: "ビジネスモデル", type: "text" },
  { key: "sukima", group: "G3", title: "スキマ", type: "text", accent: true },
  { key: "successFactors", group: "G3", title: "成功要因", type: "text" },
  { key: "finance", group: "G3", title: "財務・投資情報", type: "text" },
  { key: "aiEra", group: "G4", title: "AI時代でも持続可能か", type: "text" },
  { key: "myApplication", group: "G4", title: "自分の事業への応用アイデア", type: "text" },
  { key: "nextToResearch", group: "G4", title: "次に調べること", type: "checklist" },
  { key: "references", group: "G5", title: "参考資料・関連リンク", type: "text" },
  { key: "notes", group: "G5", title: "メモ・気づき・考察", type: "text" },
  { key: "rating", group: "G5", title: "評価・重要度", type: "text" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function emptyEntry({ type, name }) {
  const fields = {};
  CARD_DEFS.forEach((c) => {
    fields[c.key] = c.type === "tags" ? [] : c.type === "checklist" ? [] : "";
  });
  return {
    id: uid(),
    type, // "person" | "company"
    name: name || "",
    role: "",
    status: "draft", // "draft" | "investigating" | "done"
    tags: [],
    relatedText: "",
    driveFolderId: "",
    driveFiles: [],
    fields,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // noop
  }
  return { entries: [] };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // noop
  }
}

const SukimaContext = createContext(null);

export function SukimaProvider({ children }) {
  const [data, setData] = useState(loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  function addEntry(type, name) {
    const entry = emptyEntry({ type, name });
    setData((d) => ({ ...d, entries: [entry, ...d.entries] }));
    return entry.id;
  }

  function updateEntry(id, patch) {
    setData((d) => ({
      ...d,
      entries: d.entries.map((e) =>
        e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e
      ),
    }));
  }

  function updateField(id, fieldKey, value) {
    setData((d) => ({
      ...d,
      entries: d.entries.map((e) =>
        e.id === id
          ? { ...e, fields: { ...e.fields, [fieldKey]: value }, updatedAt: Date.now() }
          : e
      ),
    }));
  }

  function deleteEntry(id) {
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
  }

  function getEntry(id) {
    return data.entries.find((e) => e.id === id);
  }

  const value = {
    entries: data.entries,
    addEntry,
    updateEntry,
    updateField,
    deleteEntry,
    getEntry,
  };

  return <SukimaContext.Provider value={value}>{children}</SukimaContext.Provider>;
}

export function useSukima() {
  const ctx = useContext(SukimaContext);
  if (!ctx) throw new Error("useSukima must be used within SukimaProvider");
  return ctx;
}

export { GROUPS, CARD_DEFS };
