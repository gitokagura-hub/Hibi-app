import { createContext, useContext, useState, useEffect, useRef } from "react";
import { fetchCloud, saveCloud } from "./cloudSync";
import { scheduleAutoBackup } from "./driveAutoBackup";
import { backupNamedDataToDrive } from "./googleDrive";

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

function todayKey() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// 作り手(maker)は人物・企業とは別系統。項目は空で作り、答えた問だけキーが入る。
// キーが無い = 未回答。これで「まだ聞いていない」と「空欄と答えた」を区別する。
function emptyMaker(name) {
  return {
    id: uid(),
    type: "maker",
    name: name || "",
    stage: 1, // 1 MEET / 2 SEARCH / 3 CONTACT / 4 VISIT / 5 DEAL
    stop: null, // { reason, at } 止まった印
    metDate: todayKey(),
    fields: {},
    products: [],
    tags: [],
    status: "draft",
    role: "",
    relatedText: "",
    driveFolderId: "",
    driveFiles: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function emptyEntry({ type, name }) {
  if (type === "maker") return emptyMaker(name);
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

/* 起動時の照合。
   共通の reconcileOnStartup は「クラウドに中身があればクラウドを丸ごと採る」ため、
   圏外で追加した分が次の起動で古いクラウドに負けて消える。ここでは id ごとに
   updatedAt の新しい方を残し、片方にしか無いものは両方残す。
   ※ 圏外で削除した場合だけ、クラウド側の古い一件が戻ることがある。
     新しく入れた分が消えるより軽いので、この形にしている。
   共通ファイル(cloudSync.js)は他アプリも使うので触らない。 */
function entriesOf(d) {
  return Array.isArray(d?.entries) ? d.entries : [];
}

export function mergeEntries(baseEntries, incomingEntries) {
  const map = new Map();
  baseEntries.forEach((e) => { if (e && e.id) map.set(e.id, e); });
  incomingEntries.forEach((e) => {
    if (!e || !e.id) return;
    const cur = map.get(e.id);
    if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) map.set(e.id, e);
  });
  return [...map.values()];
}

async function reconcileSukima(localData) {
  try {
    const cloud = await fetchCloud("sukima");
    const cloudData = cloud.found ? cloud.data : null;
    const cloudEntries = entriesOf(cloudData);
    const localEntries = entriesOf(localData);

    if (cloudEntries.length === 0) {
      // クラウドが空。端末に中身があるなら、空で潰さずに送って守る
      if (localEntries.length > 0) await saveCloud("sukima", localData);
      return localData;
    }
    if (localEntries.length === 0) return cloudData;

    const merged = { ...cloudData, ...localData, entries: mergeEntries(cloudEntries, localEntries) };
    if (JSON.stringify(merged.entries) !== JSON.stringify(cloudEntries)) {
      await saveCloud("sukima", merged).catch(() => {});
    }
    return merged;
  } catch {
    // オフライン等。端末のデータのまま続ける
    return localData;
  }
}

const SukimaContext = createContext(null);

export function SukimaProvider({ children }) {
  const [data, setData] = useState(loadData);
  // データ保護ロック: クラウド照合(reconcile)が終わるまでは保存を発動させない。
  // これが無いと、起動直後のuseEffect([data])が空データをクラウドへ保存し、
  // クラウド側の本物のデータを空で上書きしてしまう(2026-08-05 Sukima消失の真因)。
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    reconcileSukima(data).then((result) => {
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
    saveCloud("sukima", data).catch(() => {});
    scheduleAutoBackup("sukima", data, (d) => backupNamedDataToDrive("sukima-backup.json", "hibi-drive-sukima-file-id", d));
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

  // 項目を「未回答」に戻す(キーごと消す)。作り手のカードで使う。
  function clearField(id, fieldKey) {
    setData((d) => ({
      ...d,
      entries: d.entries.map((e) => {
        if (e.id !== id) return e;
        const fields = { ...e.fields };
        delete fields[fieldKey];
        return { ...e, fields, updatedAt: Date.now() };
      }),
    }));
  }

  function deleteEntry(id) {
    setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }));
  }

  function getEntry(id) {
    return data.entries.find((e) => e.id === id);
  }

  // ファイルから読み込んだ分を足す。今あるものは消さず、新しい方を残す。
  // 戻り値は [増えた件数, 上書きした件数]。
  function importEntries(incoming) {
    const list = Array.isArray(incoming) ? incoming : entriesOf(incoming);
    let added = 0;
    let updated = 0;
    setData((d) => {
      const cur = entriesOf(d);
      const ids = new Set(cur.map((e) => e.id));
      list.forEach((e) => {
        if (!e || !e.id) return;
        if (!ids.has(e.id)) added += 1;
        else {
          const c = cur.find((x) => x.id === e.id);
          if ((e.updatedAt || 0) > (c.updatedAt || 0)) updated += 1;
        }
      });
      return { ...d, entries: mergeEntries(cur, list) };
    });
    return [added, updated];
  }

  // バックアップから丸ごと戻す。足りない項目は初期値で埋める。
  function replaceAllData(restored) {
    setData((prev) => ({ ...prev, ...(restored || {}) }));
  }

  const value = {
    entries: data.entries,
    replaceAllData,
    addEntry,
    updateEntry,
    updateField,
    clearField,
    importEntries,
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
