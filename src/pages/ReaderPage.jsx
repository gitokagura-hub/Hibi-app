import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, Play, Square, SkipBack, SkipForward, Shuffle, Repeat, Upload, Plus, Trash2, X, ClipboardPaste,
} from "lucide-react";
import { useSwipeBack } from "../useSwipeBack";
import { useKikinagashi } from "../kikinagashiStore";
import { useData } from "../dataStore";
import { classifyPhrases } from "../aiAssist";

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

export default function ReaderPage({ onHome }) {
  useSwipeBack(onHome);

  const { items, addItem, addItems, updateItem, deleteItem } = useKikinagashi();
  const { data } = useData();

  const [newEn, setNewEn] = useState("");
  const [newJa, setNewJa] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("すべて");
  const [editingId, setEditingId] = useState(null);
  const [editEn, setEditEn] = useState("");
  const [editJa, setEditJa] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [analysing, setAnalysing] = useState(null); // null | "running" | エラーメッセージ

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
    addItem(en, newJa, newCategory);
    setNewEn("");
    setNewJa("");
    setNewCategory("");
  }

  // --- 既存項目の編集(リスト内でインライン) ---
  function handleEdit(item) {
    setEditingId(item.id);
    setEditEn(item.en);
    setEditJa(item.ja);
    setEditCategory(item.category || "");
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
    updateItem(editingId, { en, ja: editJa.trim(), category: editCategory.trim() });
    cancelEdit();
  }

  function confirmDelete(id) {
    deleteItem(id);
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
        collected.push(...parseLines(content));
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
      if (collected.length > 0) addItems(collected);
      if (failedCount > 0) {
        alert(`${failedCount}件のファイルを読み込めませんでした。テキスト形式(.txt / .csv)のファイルを選んでください。`);
      }
    }

    e.target.value = "";
  }

  // --- Paste & AI自動分類(既存フォームの隣に小さく追加した機能) ---
  const existingCategories = [...new Set(items.map((it) => it.category).filter(Boolean))];

  async function handleAnalyse() {
    const text = pasteText.trim();
    if (!text) return;
    const provider = data.settings.claudeKey ? "claude" : data.settings.geminiKey ? "gemini" : null;
    const apiKey = provider === "claude" ? data.settings.claudeKey : provider === "gemini" ? data.settings.geminiKey : "";
    if (!provider) {
      setAnalysing("Settings画面でClaudeまたはGeminiのAPIキーを設定してください。");
      return;
    }
    setAnalysing("running");
    try {
      const classified = await classifyPhrases({ provider, apiKey, rawText: text, existingCategories });
      if (classified.length === 0) throw new Error("EMPTY_RESULT");
      addItems(classified);
      setPasteText("");
      setPasteOpen(false);
      setAnalysing(null);
    } catch (err) {
      const msg = err.message === "CLASSIFY_PARSE_FAILED" || err.message === "EMPTY_RESULT"
        ? "AIの応答をうまく読み取れませんでした。もう一度お試しください。"
        : "分類に失敗しました。APIキーとネット接続を確認してください。";
      setAnalysing(msg);
    }
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

  // カテゴリーフィルター(「すべて」なら全件、それ以外は絞り込み)。
  // 再生・一覧表示ともにこのfilteredItemsを使う。
  const filteredItems = categoryFilter === "すべて" ? items : items.filter((it) => (it.category || "未分類") === categoryFilter);

  useEffect(() => {
    itemsRef.current = filteredItems;
  }, [filteredItems]); // eslint-disable-line react-hooks/exhaustive-deps
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

  function handlePlay() {
    if (playing) {
      stopAll();
      return;
    }
    if (filteredItems.length === 0) return;
    itemsRef.current = filteredItems;
    const newOrder = settings.shuffle ? shuffleArr(filteredItems.map((_, i) => i)) : filteredItems.map((_, i) => i);
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
  function playFrom(index) {
    speechSynthesis.cancel();
    clearTimeout(pauseTimerRef.current);
    const newOrder = itemsRef.current.map((_, i) => i);
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

  return (
    <div className="min-h-screen bg-app-bg relative">
      {pasteOpen && (
        <div className="fixed inset-0 z-[55] flex items-end bg-black/30" onClick={() => { setPasteOpen(false); setAnalysing(null); }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-app-surface rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Paste ChatGPT Summary</h2>
              <button onClick={() => { setPasteOpen(false); setAnalysing(null); }} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-sub active:bg-app-raised">
                <X size={18} />
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"英文 | 訳 の形式で1行ずつ貼り付け\n\n例:\nCould you pass me the level? | 水準器を取ってもらえますか。"}
              rows={8}
              autoFocus
              className="w-full rounded-2xl border border-app-line p-4 text-sm outline-none focus:border-gray-400 resize-none placeholder:text-ink-sub/70"
            />
            <button
              onClick={handleAnalyse}
              disabled={!pasteText.trim() || analysing === "running"}
              className="mt-3 w-full h-12 rounded-full bg-gray-900 text-white text-sm font-medium disabled:opacity-30"
            >
              {analysing === "running" ? "Analysing..." : "Analyse(AIで自動分類)"}
            </button>
            {analysing && analysing !== "running" && (
              <p className="mt-3 text-sm text-red-500">{analysing}</p>
            )}
          </div>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 z-50 bg-app-surface flex flex-col">
          <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-app-line">
            <h2 className="text-lg font-semibold">フレーズを編集</h2>
            <button
              onClick={cancelEdit}
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-sub active:bg-app-raised"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
            <div>
              <label className="text-xs font-medium text-ink-sub">フレーズ</label>
              <textarea
                value={editEn}
                onChange={(e) => setEditEn(e.target.value)}
                placeholder="フレーズ"
                autoFocus
                rows={4}
                className="w-full text-base border-b border-app-line py-2 mt-1 outline-none focus:border-gray-400 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-sub">訳(任意)</label>
              <textarea
                value={editJa}
                onChange={(e) => setEditJa(e.target.value)}
                placeholder="訳(任意)"
                rows={3}
                className="w-full text-base border-b border-app-line py-2 mt-1 outline-none focus:border-gray-400 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-sub">カテゴリー(任意)</label>
              <input
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                placeholder="カテゴリー(任意)"
                list="kikinagashi-category-list"
                className="w-full text-base border-b border-app-line py-2 mt-1 outline-none focus:border-gray-400"
              />
            </div>
          </div>
          <div className="px-5 pb-8 pt-3 border-t border-app-line flex gap-3">
            <button
              onClick={cancelEdit}
              className="flex-1 h-12 rounded-full border border-app-line text-sm font-medium text-ink-sub"
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
        onClick={onHome}
        className="fixed bottom-6 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">English Manager</h1>
        <p className="mt-1 text-sm text-ink-sub">{items.length}件のフレーズを保存中</p>
      </header>

      <main className="px-5 pb-32">
        {/* --- 新しいフレーズを追加 --- */}
        <div className="rounded-2xl border border-app-line p-4">
          <span className="text-xs font-medium text-ink-sub">新しいフレーズを追加</span>
          <input
            value={newEn}
            onChange={(e) => setNewEn(e.target.value)}
            placeholder="フレーズ"
            className="w-full text-sm border-b border-app-line py-2 mt-2 outline-none focus:border-gray-400"
          />
          <input
            value={newJa}
            onChange={(e) => setNewJa(e.target.value)}
            placeholder="訳(任意)"
            className="w-full text-sm border-b border-app-line py-2 mt-2 outline-none focus:border-gray-400"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="カテゴリー(任意、自由入力)"
            list="kikinagashi-category-list"
            className="w-full text-sm border-b border-app-line py-2 mt-2 outline-none focus:border-gray-400"
          />
          <datalist id="kikinagashi-category-list">
            {existingCategories.map((c) => <option key={c} value={c} />)}
          </datalist>
          <button
            onClick={handleAdd}
            disabled={!newEn.trim()}
            className="mt-3 w-full h-11 rounded-full bg-gray-900 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            <Plus size={15} />
            保存
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={() => setPasteOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 px-2.5 py-1.5 rounded-full border border-indigo-100 bg-indigo-50 active:scale-95 transition-transform"
          >
            <ClipboardPaste size={13} />
            Paste
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 px-2.5 py-1.5 rounded-full border border-indigo-100 bg-indigo-50 active:scale-95 transition-transform"
          >
            <Upload size={13} />
            ファイルからまとめて追加
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.csv,text/plain,text/csv"
            onChange={handleFilePicked}
            className="hidden"
          />
        </div>

        {/* --- カテゴリーフィルター --- */}
        {existingCategories.length > 0 && (
          <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
            {["すべて", ...existingCategories].map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${
                  categoryFilter === c ? "bg-gray-900 text-white border-gray-900" : "text-ink-sub border-app-line"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* --- 保存済みリスト --- */}
        {filteredItems.length > 0 && (
          <div className="mt-4 rounded-2xl border border-app-line divide-y divide-app-line overflow-hidden">
            {filteredItems.map((it, i) => {
              const isPlaying = current && order[pos] === i;
              const isEditing = editingId === it.id;
              const isDeleting = deletingId === it.id;

              if (isDeleting) {
                return (
                  <div key={it.id} className="bg-red-50 border-l-4 border-red-400 px-3.5 py-3.5">
                    <div className="text-sm text-ink leading-snug break-words mb-3">
                      「{it.en}」を削除しますか？
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeletingId(null)}
                        className="flex-1 h-9 rounded-full border border-app-line text-xs font-medium text-ink-sub flex items-center justify-center gap-1"
                      >
                        <X size={13} /> キャンセル
                      </button>
                      <button
                        onClick={() => confirmDelete(it.id)}
                        className="flex-1 h-9 rounded-full bg-red-600 text-white text-xs font-medium"
                      >
                        削除する
                      </button>
                    </div>
                  </div>
                );
              }

              if (isEditing) {
                // フルスクリーン編集モーダル側で表示するので、リスト内には何も出さない
                return null;
              }

              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-2 px-3.5 py-3.5 ${isPlaying ? "bg-indigo-50 border-l-4 border-indigo-400" : "border-l-4 border-transparent"}`}
                >
                  <button
                    onClick={() => playFrom(i)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-ink-sub shrink-0 active:bg-app-raised"
                    aria-label="この項目を再生"
                  >
                    <Play size={15} />
                  </button>
                  <button
                    onClick={() => handleEdit(it)}
                    className="flex-1 min-w-0 text-left pt-0.5"
                  >
                    <div className="text-sm text-ink leading-snug break-words line-clamp-2">{it.en}</div>
                    {it.ja && <div className="text-xs text-ink-sub leading-snug break-words mt-1 line-clamp-1">{it.ja}</div>}
                    {categoryFilter === "すべて" && it.category && (
                      <span className="inline-block mt-1 text-[10px] text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">{it.category}</span>
                    )}
                  </button>
                  <button onClick={() => setDeletingId(it.id)} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-sub shrink-0 active:bg-app-raised">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-app-line p-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs font-medium text-ink-sub w-20 shrink-0">言語</label>
            <select
              value={settings.lang}
              onChange={(e) => update({ lang: e.target.value })}
              className="flex-1 text-sm border-b border-app-line py-1.5 outline-none"
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {labelFor(l)} ({l})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-sub w-20 shrink-0">声</label>
            <select
              value={settings.voiceName}
              onChange={(e) => update({ voiceName: e.target.value })}
              className="flex-1 text-sm border-b border-app-line py-1.5 outline-none"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-app-line p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-sub w-24 shrink-0">繰り返し回数</label>
            <input
              type="range" min="1" max="5" step="1"
              value={settings.repeat}
              onChange={(e) => update({ repeat: parseInt(e.target.value, 10) })}
              className="flex-1"
            />
            <span className="text-xs text-ink-sub w-6 text-right">{settings.repeat}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-sub w-24 shrink-0">速度</label>
            <input
              type="range" min="0.5" max="1.3" step="0.05"
              value={settings.rate}
              onChange={(e) => update({ rate: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-ink-sub w-9 text-right">{settings.rate}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-ink-sub w-24 shrink-0">間隔(秒)</label>
            <input
              type="range" min="0.5" max="4" step="0.5"
              value={settings.pause}
              onChange={(e) => update({ pause: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-ink-sub w-9 text-right">{settings.pause}</span>
          </div>
          <label className="flex items-center gap-3 pt-1">
            <input type="checkbox" checked={settings.readJa} onChange={(e) => update({ readJa: e.target.checked })} />
            <span className="text-xs text-ink-sub">日本語訳も読み上げる</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.shuffle} onChange={(e) => update({ shuffle: e.target.checked })} />
            <span className="text-xs text-ink-sub flex items-center gap-1"><Shuffle size={12} /> シャッフル</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={settings.loopAll} onChange={(e) => update({ loopAll: e.target.checked })} />
            <span className="text-xs text-ink-sub flex items-center gap-1"><Repeat size={12} /> 最後まで行ったら最初に戻る</span>
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-app-line p-6 text-center min-h-[110px] flex flex-col justify-center">
          {current ? (
            <>
              <div className="text-xs text-ink-sub mb-2">{pos + 1} / {order.length}</div>
              <div className="text-lg font-medium text-ink">{current.en}</div>
              {current.ja && <div className="text-sm text-ink-sub mt-1.5 italic">{current.ja}</div>}
            </>
          ) : (
            <div className="text-sm text-ink-sub">フレーズを保存して再生してください</div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => handleSkip(-1)}
            className="w-12 h-12 rounded-full border border-app-line flex items-center justify-center active:scale-95 transition-transform"
          >
            <SkipBack size={18} className="text-ink-sub" />
          </button>
          <button
            onClick={handlePlay}
            disabled={filteredItems.length === 0}
            className="flex-1 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            {playing ? <Square size={16} /> : <Play size={16} />}
            <span className="text-sm font-medium">{playing ? "停止" : "再生"}</span>
          </button>
          <button
            onClick={() => handleSkip(1)}
            className="w-12 h-12 rounded-full border border-app-line flex items-center justify-center active:scale-95 transition-transform"
          >
            <SkipForward size={18} className="text-ink-sub" />
          </button>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-ink-sub border-t border-app-line pt-4">
          端末の音声合成機能(Web Speech API)を使用。APIキー不要・無料。画面を閉じる/ロックすると再生は止まる場合があります。
        </p>
      </main>
    </div>
  );
}
