import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, Play, Square, SkipBack, SkipForward, Shuffle, Repeat, Upload, Plus, Trash2, X,
} from "lucide-react";
import { useSwipeBack } from "../useSwipeBack";
import { useData } from "../dataStore";
import { classifyPhrases } from "../aiAssist";

const STORAGE_KEY = "kikinagashi-items";
const LEGACY_STORAGE_KEY = "kikinagashi-list"; // 旧・textarea一括版のデータ(移行用)
const SETTINGS_KEY = "kikinagashi-settings";

const LANG_NAMES = {
  "en-gb": "English (UK)", "en-us": "English (US)", "en-au": "English (Australia)",
  "en-in": "English (India)", "en-ie": "English (Ireland)", "en-za": "English (South Africa)",
  "ja-jp": "日本語", ja: "日本語",
  "fr-fr": "Français", "de-de": "Deutsch", "es-es": "Español", "es-mx": "Español (México)",
  "it-it": "Italiano", "pt-br": "Português (Brasil)", "ko-kr": "한국어",
  "zh-cn": "中文(简体)", "zh-tw": "中文(繁體)", "ru-ru": "Русский",
};
function labelFor(lang) {
  return LANG_NAMES[lang.toLowerCase()] || lang;
}

function splitLine(l) {
  const sep = l.includes("|") ? "|" : l.includes(",") ? "," : null;
  if (!sep) return { en: l.trim(), ja: "" };
  const idx = l.indexOf(sep);
  return { en: l.slice(0, idx).trim(), ja: l.slice(idx + 1).trim() };
}

function parseLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(splitLine);
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadSavedItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw).map((it) => ({ category: "未分類", ...it }));
  } catch {}
  // 旧フォーマット(改行区切りテキスト)からの移行
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && legacy.trim()) {
      return parseLines(legacy).map((it) => ({ id: makeId(), category: "未分類", ...it }));
    }
  } catch {}
  return [];
}

export default function ReaderPage({ onHome }) {
  useSwipeBack(onHome);
  const { data } = useData();

  const [items, setItems] = useState(loadSavedItems);
  const [newEn, setNewEn] = useState("");
  const [newJa, setNewJa] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // view: "home" (category list) | "category" (phrase list within one category) | "paste" (ChatGPT summary paste+classify)
  const [view, setView] = useState("home");
  const [activeCategory, setActiveCategory] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState("");
  const [justAdded, setJustAdded] = useState(null); // { total, byCategory: [{name, count}] }

  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        repeat: saved.repeat ?? 2,
        rate: saved.rate ?? 0.85,
        pause: saved.pause ?? 1.5,
        readJa: saved.readJa ?? false,
        shuffle: saved.shuffle ?? false,
        loopAll: saved.loopAll ?? true,
        lang: saved.lang ?? "",
        voiceName: saved.voiceName ?? "",
      };
    } catch {
      return { repeat: 2, rate: 0.85, pause: 1.5, readJa: false, shuffle: false, loopAll: true, lang: "", voiceName: "" };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const [allVoices, setAllVoices] = useState([]);
  const [langs, setLangs] = useState([]);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    function loadVoices() {
      const v = speechSynthesis.getVoices();
      if (v.length === 0) return;
      setAllVoices(v);
      const uniqueLangs = [...new Set(v.map((x) => x.lang))].sort((a, b) => {
        const pa = a.toLowerCase() === "en-gb" ? 0 : a.toLowerCase().startsWith("ja") ? 1 : 2;
        const pb = b.toLowerCase() === "en-gb" ? 0 : b.toLowerCase().startsWith("ja") ? 1 : 2;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
      });
      setLangs(uniqueLangs);
      setSettings((s) => ({ ...s, lang: s.lang || uniqueLangs[0] || "" }));
    }
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    const filtered = allVoices.filter((v) => v.lang === settings.lang);
    setVoices(filtered);
    if (filtered.length > 0 && !filtered.find((v) => v.name === settings.voiceName)) {
      setSettings((s) => ({ ...s, voiceName: filtered[0].name }));
    }
  }, [settings.lang, allVoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const findJaVoice = useCallback(() => {
    return allVoices.find((v) => v.lang.toLowerCase().startsWith("ja")) || null;
  }, [allVoices]);

  // --- 新規追加(上のフォーム専用) ---
  function handleAdd() {
    const en = newEn.trim();
    if (!en) return;
    const category = activeCategory || "未分類";
    setItems((prev) => [...prev, { id: makeId(), en, ja: newJa.trim(), category }]);
    setNewEn("");
    setNewJa("");
  }

  // --- 既存項目の編集(リスト内でインライン) ---
  function handleEdit(item) {
    setEditingId(item.id);
    setEditEn(item.en);
    setEditJa(item.ja);
    setEditCategory(item.category || "未分類");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditEn("");
    setEditJa("");
    setEditCategory("");
  }

  function saveEdit() {
    const en = editEn.trim();
    if (!en) return;
    setItems((prev) => prev.map((it) => (it.id === editingId ? { ...it, en, ja: editJa.trim(), category: editCategory.trim() || "未分類" } : it)));
    cancelEdit();
  }

  function confirmDelete(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (editingId === id) cancelEdit();
    setDeletingId(null);
  }

  const fileInputRef = useRef(null);
  function handleFilePicked(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let failedCount = 0;
    let pendingCount = files.length;
    const collected = [];

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = String(ev.target.result || "");
        collected.push(...parseLines(content).map((it) => ({ id: makeId(), ...it })));
        pendingCount--;
        if (pendingCount === 0) finish();
      };
      reader.onerror = () => {
        failedCount++;
        pendingCount--;
        if (pendingCount === 0) finish();
      };
      reader.readAsText(file, "UTF-8");
    });

    function finish() {
      if (collected.length > 0) setItems((prev) => [...prev, ...collected]);
      if (failedCount > 0) {
        alert(`${failedCount}件のファイルを読み込めませんでした。テキスト形式(.txt / .csv)のファイルを選んでください。`);
      }
    }

    e.target.value = "";
  }

  // --- playback state ---
  const [playing, setPlaying] = useState(false);
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const itemsRef = useRef([]);
  const orderRef = useRef([]);
  const posRef = useRef(0);
  const repeatCountRef = useRef(0);
  const playingRef = useRef(false);
  const pauseTimerRef = useRef(null);
  const settingsRef = useRef(settings);
  const allVoicesRef = useRef(allVoices);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // 再生ループはsetTimeoutで自己再帰するため、settings/allVoicesを直接
  // クロージャで参照すると「再生開始時点の値」に固定されてしまう。
  // refに常に最新値を反映し、ループ内はrefから読むことでスライダー等の
  // 変更が再生中もすぐ反映されるようにする。
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    allVoicesRef.current = allVoices;
  }, [allVoices]);

  const current = order.length > 0 && itemsRef.current[order[pos]] ? itemsRef.current[order[pos]] : null;

  function stopAll() {
    playingRef.current = false;
    setPlaying(false);
    speechSynthesis.cancel();
    clearTimeout(pauseTimerRef.current);
  }

  const speakCurrent = useCallback(() => {
    if (!playingRef.current) return;
    const item = itemsRef.current[orderRef.current[posRef.current]];
    if (!item) return;
    const s = settingsRef.current;

    const utter = new SpeechSynthesisUtterance(item.en);
    const voice = allVoicesRef.current.find((v) => v.name === s.voiceName);
    if (voice) utter.voice = voice;
    utter.rate = s.rate;

    utter.onend = () => {
      if (!playingRef.current) return;
      const s2 = settingsRef.current;
      if (s2.readJa && item.ja) {
        const jaVoice = findJaVoice();
        const jaUtter = new SpeechSynthesisUtterance(item.ja);
        if (jaVoice) jaUtter.voice = jaVoice;
        jaUtter.rate = s2.rate;
        jaUtter.onend = () => afterOneRepeat();
        speechSynthesis.speak(jaUtter);
      } else {
        afterOneRepeat();
      }
    };
    speechSynthesis.speak(utter);
  }, [findJaVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  function afterOneRepeat() {
    if (!playingRef.current) return;
    repeatCountRef.current++;
    const s = settingsRef.current;
    pauseTimerRef.current = setTimeout(() => {
      if (!playingRef.current) return;
      const s2 = settingsRef.current;
      if (repeatCountRef.current < s2.repeat) {
        speakCurrent();
      } else {
        repeatCountRef.current = 0;
        let next = posRef.current + 1;
        if (next >= orderRef.current.length) {
          if (s2.loopAll) {
            const newOrder = s2.shuffle
              ? shuffleArr(itemsRef.current.map((_, i) => i))
              : itemsRef.current.map((_, i) => i);
            orderRef.current = newOrder;
            setOrder(newOrder);
            next = 0;
          } else {
            stopAll();
            return;
          }
        }
        posRef.current = next;
        setPos(next);
        speakCurrent();
      }
    }, s.pause * 1000);
  }

  function handlePlay(targetList) {
    if (playing) {
      stopAll();
      return;
    }
    const list = targetList || items;
    if (list.length === 0) return;
    itemsRef.current = list;
    const newOrder = settings.shuffle ? shuffleArr(list.map((_, i) => i)) : list.map((_, i) => i);
    orderRef.current = newOrder;
    setOrder(newOrder);
    posRef.current = 0;
    setPos(0);
    repeatCountRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    speakCurrent();
  }

  function handleSkip(dir) {
    if (orderRef.current.length === 0) return;
    speechSynthesis.cancel();
    clearTimeout(pauseTimerRef.current);
    repeatCountRef.current = 0;
    const len = orderRef.current.length;
    const next = (posRef.current + dir + len) % len;
    posRef.current = next;
    setPos(next);
    if (playingRef.current) speakCurrent();
  }

  // リストの項目をタップして「これを読んで」と選択・即再生する
  // list: 表示中のリスト(全件 or 特定カテゴリー)。indexはそのリスト内でのインデックス。
  function playFrom(list, index) {
    speechSynthesis.cancel();
    clearTimeout(pauseTimerRef.current);
    itemsRef.current = list;
    const newOrder = list.map((_, i) => i);
    orderRef.current = newOrder;
    setOrder(newOrder);
    posRef.current = index;
    setPos(index);
    repeatCountRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    speakCurrent();
  }

  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      clearTimeout(pauseTimerRef.current);
    };
  }, []);

  function update(patch) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  // --- ChatGPTまとめの貼り付け→AI分類→一括登録 ---
  const aiProvider = data?.settings?.claudeKey ? "claude" : data?.settings?.geminiKey ? "gemini" : null;
  const aiApiKey = aiProvider === "claude" ? data?.settings?.claudeKey : aiProvider === "gemini" ? data?.settings?.geminiKey : "";

  async function handleClassifyPaste() {
    if (!pasteText.trim()) return;
    if (!aiProvider) {
      setClassifyError("Settings画面でGeminiまたはClaudeのAPIキーを設定してください。");
      return;
    }
    setClassifying(true);
    setClassifyError("");
    try {
      const classified = await classifyPhrases({ provider: aiProvider, apiKey: aiApiKey, rawText: pasteText });
      if (classified.length === 0) {
        setClassifyError("フレーズを認識できませんでした。1行に1フレーズの形で貼り付けてください。");
        return;
      }
      const newItems = classified.map((c) => ({ id: makeId(), en: c.en, ja: c.ja, category: c.category }));
      setItems((prev) => [...prev, ...newItems]);

      const counts = {};
      newItems.forEach((it) => { counts[it.category] = (counts[it.category] || 0) + 1; });
      setJustAdded({
        total: newItems.length,
        byCategory: Object.entries(counts).map(([name, count]) => ({ name, count })),
      });
      setPasteText("");
    } catch (err) {
      if (err.message === "NO_API_KEY") setClassifyError("APIキーが設定されていません。");
      else if (err.message === "CLASSIFY_PARSE_FAILED") setClassifyError("AIの応答を読み取れませんでした。もう一度お試しください。");
      else setClassifyError("分類に失敗しました（" + (err?.message || "不明なエラー") + "）");
    } finally {
      setClassifying(false);
    }
  }

  // カテゴリー一覧(件数付き、フレーズが1件もないカテゴリーは出さない)
  const categoryList = (() => {
    const counts = {};
    items.forEach((it) => {
      const cat = it.category || "未分類";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const categoryItems = activeCategory ? items.filter((it) => (it.category || "未分類") === activeCategory) : [];

  return (
    <div className="min-h-screen bg-white relative">
      {editingId && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-gray-100">
            <h2 className="text-lg font-semibold">フレーズを編集</h2>
            <button
              onClick={cancelEdit}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
            <div>
              <label className="text-xs font-medium text-gray-400">フレーズ</label>
              <textarea
                value={editEn}
                onChange={(e) => setEditEn(e.target.value)}
                placeholder="フレーズ"
                autoFocus
                rows={4}
                className="w-full text-base border-b border-gray-200 py-2 mt-1 outline-none focus:border-gray-400 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">訳(任意)</label>
              <textarea
                value={editJa}
                onChange={(e) => setEditJa(e.target.value)}
                placeholder="訳(任意)"
                rows={3}
                className="w-full text-base border-b border-gray-200 py-2 mt-1 outline-none focus:border-gray-400 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">カテゴリー</label>
              <input
                list="reader-category-options"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="カテゴリー"
                className="w-full text-base border-b border-gray-200 py-2 mt-1 outline-none focus:border-gray-400"
              />
              <datalist id="reader-category-options">
                {categoryList.map((c) => <option key={c.name} value={c.name} />)}
              </datalist>
            </div>
          </div>
          <div className="px-5 pb-8 pt-3 border-t border-gray-100 flex gap-3">
            <button
              onClick={cancelEdit}
              className="flex-1 h-12 rounded-full border border-gray-300 text-sm font-medium text-gray-600"
            >
              キャンセル
            </button>
            <button
              onClick={saveEdit}
              disabled={!editEn.trim()}
              className="flex-1 h-12 rounded-full bg-gray-900 text-white text-sm font-medium disabled:opacity-30"
            >
              更新
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (view === "home") onHome();
          else if (view === "paste") setView("home");
          else { setView("home"); setActiveCategory(null); }
        }}
        className="fixed bottom-6 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {view === "home" ? "English Learning" : view === "paste" ? "Paste ChatGPT Summary" : activeCategory}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {view === "home" ? `${items.length}件のフレーズを保存中` : view === "category" ? `${categoryItems.length}件` : "ChatGPTのまとめを貼り付けて自動整理"}
        </p>
      </header>

      {view === "home" && (
        <main className="px-5 pb-32">
          <button
            onClick={() => { setView("paste"); setJustAdded(null); setClassifyError(""); }}
            className="w-full h-14 rounded-2xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Plus size={16} />
            Paste ChatGPT Summary
          </button>

          {categoryList.length === 0 ? (
            <div className="mt-10 text-center text-sm text-gray-400">
              まだフレーズがありません。<br />上のボタンから追加してください。
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {categoryList.map((c) => (
                <button
                  key={c.name}
                  onClick={() => { setActiveCategory(c.name); setView("category"); }}
                  className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50"
                >
                  <span className="text-sm text-gray-900">{c.name}</span>
                  <span className="text-sm text-gray-400">{c.count}</span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-6 text-xs leading-relaxed text-gray-400 border-t border-gray-100 pt-4">
            端末の音声合成機能(Web Speech API)を使用。APIキー不要・無料。画面を閉じる/ロックすると再生は止まる場合があります。
          </p>
        </main>
      )}

      {view === "paste" && (
        <main className="px-5 pb-32">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="ChatGPTのまとめをここへ貼り付け"
            rows={10}
            autoFocus
            className="w-full rounded-2xl border border-gray-200 p-4 text-sm outline-none focus:border-gray-400 resize-none"
          />
          {classifyError && <p className="mt-3 text-xs text-red-500">{classifyError}</p>}
          <button
            onClick={handleClassifyPaste}
            disabled={!pasteText.trim() || classifying}
            className="mt-4 w-full h-12 rounded-full bg-gray-900 text-white text-sm font-medium disabled:opacity-30"
          >
            {classifying ? "Analysing..." : "Analyse"}
          </button>

          {justAdded && (
            <div className="mt-6 rounded-2xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">✓ {justAdded.total} phrases found</p>
              <div className="space-y-1">
                {justAdded.byCategory.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm text-gray-600">
                    <span>{c.name}</span>
                    <span>{c.count}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setView("home"); setJustAdded(null); }}
                className="mt-4 w-full h-11 rounded-full border border-gray-300 text-sm font-medium text-gray-600"
              >
                ホームへ戻る
              </button>
            </div>
          )}
        </main>
      )}

      {view === "category" && (
        <main className="px-5 pb-32">
          <button
            onClick={() => handlePlay(categoryItems)}
            disabled={categoryItems.length === 0}
            className="w-full h-12 rounded-full bg-gray-900 text-white flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            {playing ? <Square size={16} /> : <Play size={16} />}
            <span className="text-sm font-medium">{playing ? "停止" : "Play All"}</span>
          </button>

          {current && (
            <div className="mt-4 rounded-2xl border border-gray-200 p-5 text-center">
              <div className="text-xs text-gray-400 mb-1.5">{pos + 1} / {order.length}</div>
              <div className="text-base font-medium text-gray-900">{current.en}</div>
              {current.ja && <div className="text-sm text-gray-500 mt-1 italic">{current.ja}</div>}
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => handleSkip(-1)} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center active:scale-95">
                  <SkipBack size={14} className="text-gray-600" />
                </button>
                <button onClick={() => handleSkip(1)} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center active:scale-95">
                  <SkipForward size={14} className="text-gray-600" />
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {categoryItems.map((it, i) => {
              const isPlaying = current && categoryItems[order[pos]] === it;
              const isDeleting = deletingId === it.id;

              if (isDeleting) {
                return (
                  <div key={it.id} className="bg-red-50 border-l-4 border-red-400 px-3.5 py-3.5">
                    <div className="text-sm text-gray-800 leading-snug break-words mb-3">
                      「{it.en}」を削除しますか？
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDeletingId(null)} className="flex-1 h-9 rounded-full border border-gray-300 text-xs font-medium text-gray-600 flex items-center justify-center gap-1">
                        <X size={13} /> キャンセル
                      </button>
                      <button onClick={() => confirmDelete(it.id)} className="flex-1 h-9 rounded-full bg-red-600 text-white text-xs font-medium">
                        削除する
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-2 px-3.5 py-3.5 ${isPlaying ? "bg-indigo-50 border-l-4 border-indigo-400" : "border-l-4 border-transparent"}`}
                >
                  <button
                    onClick={() => playFrom(categoryItems, i)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 shrink-0 active:bg-gray-100"
                    aria-label="この項目を再生"
                  >
                    <Play size={15} />
                  </button>
                  <button onClick={() => handleEdit(it)} className="flex-1 min-w-0 text-left pt-0.5">
                    <div className="text-sm text-gray-900 leading-snug break-words">{it.en}</div>
                    {it.ja && <div className="text-xs text-gray-400 leading-snug break-words mt-1">{it.ja}</div>}
                  </button>
                  <button onClick={() => setDeletingId(it.id)} className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 shrink-0 active:bg-gray-100">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* --- このカテゴリーに手動でフレーズを追加 --- */}
          <div className="mt-5 rounded-2xl border border-gray-200 p-4">
            <span className="text-xs font-medium text-gray-400">「{activeCategory}」に追加</span>
            <input
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              placeholder="フレーズ"
              className="w-full text-sm border-b border-gray-200 py-2 mt-2 outline-none focus:border-gray-400"
            />
            <input
              value={newJa}
              onChange={(e) => setNewJa(e.target.value)}
              placeholder="訳(任意)"
              className="w-full text-sm border-b border-gray-200 py-2 mt-2 outline-none focus:border-gray-400"
            />
            <button
              onClick={handleAdd}
              disabled={!newEn.trim()}
              className="mt-3 w-full h-11 rounded-full bg-gray-900 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 active:scale-[0.98] transition-transform"
            >
              <Plus size={15} />
              保存
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <label className="text-xs font-medium text-gray-500 w-20 shrink-0">言語</label>
              <select
                value={settings.lang}
                onChange={(e) => update({ lang: e.target.value })}
                className="flex-1 text-sm border-b border-gray-200 py-1.5 outline-none"
              >
                {langs.map((l) => (
                  <option key={l} value={l}>{labelFor(l)} ({l})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-20 shrink-0">声</label>
              <select
                value={settings.voiceName}
                onChange={(e) => update({ voiceName: e.target.value })}
                className="flex-1 text-sm border-b border-gray-200 py-1.5 outline-none"
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-24 shrink-0">繰り返し回数</label>
              <input type="range" min="1" max="5" step="1" value={settings.repeat} onChange={(e) => update({ repeat: parseInt(e.target.value, 10) })} className="flex-1" />
              <span className="text-xs text-gray-500 w-6 text-right">{settings.repeat}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-24 shrink-0">速度</label>
              <input type="range" min="0.5" max="1.3" step="0.05" value={settings.rate} onChange={(e) => update({ rate: parseFloat(e.target.value) })} className="flex-1" />
              <span className="text-xs text-gray-500 w-9 text-right">{settings.rate}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 w-24 shrink-0">間隔(秒)</label>
              <input type="range" min="0.5" max="4" step="0.5" value={settings.pause} onChange={(e) => update({ pause: parseFloat(e.target.value) })} className="flex-1" />
              <span className="text-xs text-gray-500 w-9 text-right">{settings.pause}</span>
            </div>
            <label className="flex items-center gap-3 pt-1">
              <input type="checkbox" checked={settings.readJa} onChange={(e) => update({ readJa: e.target.checked })} />
              <span className="text-xs text-gray-600">日本語訳も読み上げる</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={settings.shuffle} onChange={(e) => update({ shuffle: e.target.checked })} />
              <span className="text-xs text-gray-600 flex items-center gap-1"><Shuffle size={12} /> シャッフル</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={settings.loopAll} onChange={(e) => update({ loopAll: e.target.checked })} />
              <span className="text-xs text-gray-600 flex items-center gap-1"><Repeat size={12} /> 最後まで行ったら最初に戻る</span>
            </label>
          </div>
        </main>
      )}
    </div>
  );
}
