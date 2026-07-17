import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, Play, Square, SkipBack, SkipForward, Shuffle, Repeat, Upload, Plus, Trash2, Pencil, X,
} from "lucide-react";
import { useSwipeBack } from "../useSwipeBack";
import { useConfirm } from "../components/ConfirmModal";

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
    if (raw) return JSON.parse(raw);
  } catch {}
  // 旧フォーマット(改行区切りテキスト)からの移行
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && legacy.trim()) {
      return parseLines(legacy).map((it) => ({ id: makeId(), ...it }));
    }
  } catch {}
  return [];
}

export default function ReaderPage({ onHome }) {
  useSwipeBack(onHome);
  const confirm = useConfirm();

  const [items, setItems] = useState(loadSavedItems);
  const [enInput, setEnInput] = useState("");
  const [jaInput, setJaInput] = useState("");
  const [editingId, setEditingId] = useState(null);

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

  // --- add / edit / delete saved items ---
  function handleSave() {
    const en = enInput.trim();
    if (!en) return;
    const ja = jaInput.trim();
    if (editingId) {
      setItems((prev) => prev.map((it) => (it.id === editingId ? { ...it, en, ja } : it)));
      setEditingId(null);
    } else {
      setItems((prev) => [...prev, { id: makeId(), en, ja }]);
    }
    setEnInput("");
    setJaInput("");
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setEnInput(item.en);
    setJaInput(item.ja);
  }

  function cancelEdit() {
    setEditingId(null);
    setEnInput("");
    setJaInput("");
  }

  async function handleDelete(id, en) {
    if (!(await confirm(`「${en}」を削除しますか？`))) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (editingId === id) cancelEdit();
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

  function handlePlay() {
    if (playing) {
      stopAll();
      return;
    }
    if (items.length === 0) return;
    itemsRef.current = items;
    const newOrder = settings.shuffle ? shuffleArr(items.map((_, i) => i)) : items.map((_, i) => i);
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
    <div className="min-h-screen bg-white relative">
      <button
        onClick={onHome}
        className="fixed bottom-6 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">聞き流し</h1>
        <p className="mt-1 text-sm text-gray-500">{items.length}件のフレーズを保存中</p>
      </header>

      <main className="px-5 pb-32">
        {/* --- 1件ずつ追加するフォーム --- */}
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">{editingId ? "編集中" : "新しいフレーズを追加"}</span>
            {editingId && (
              <button onClick={cancelEdit} className="text-xs text-gray-400 flex items-center gap-1">
                <X size={12} /> キャンセル
              </button>
            )}
          </div>
          <input
            value={enInput}
            onChange={(e) => setEnInput(e.target.value)}
            placeholder="フレーズ"
            className="w-full text-sm border-b border-gray-200 py-2 outline-none focus:border-gray-400"
          />
          <input
            value={jaInput}
            onChange={(e) => setJaInput(e.target.value)}
            placeholder="訳(任意)"
            className="w-full text-sm border-b border-gray-200 py-2 mt-2 outline-none focus:border-gray-400"
          />
          <button
            onClick={handleSave}
            disabled={!enInput.trim()}
            className="mt-3 w-full h-11 rounded-full bg-gray-900 text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            <Plus size={15} />
            {editingId ? "更新して保存" : "保存"}
          </button>
        </div>

        <div className="flex items-center justify-end mt-2">
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

        {/* --- 保存済みリスト --- */}
        {items.length > 0 && (
          <div className="mt-4 rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {items.map((it, i) => {
              const isPlaying = current && order[pos] === i;
              const isEditing = editingId === it.id;
              const rowClass = isEditing
                ? "bg-amber-50 border-l-4 border-amber-400 pl-2.5"
                : isPlaying
                ? "bg-indigo-50 border-l-4 border-indigo-400 pl-2.5"
                : "border-l-4 border-transparent pl-2.5";
              return (
                <div key={it.id} className={`flex items-center gap-2 px-3.5 py-2.5 ${rowClass}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">{it.en}</div>
                    {it.ja && <div className="text-xs text-gray-400 truncate">{it.ja}</div>}
                  </div>
                  <button onClick={() => handleEdit(it)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 shrink-0">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(it.id, it.en)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs font-medium text-gray-500 w-20 shrink-0">言語</label>
            <select
              value={settings.lang}
              onChange={(e) => update({ lang: e.target.value })}
              className="flex-1 text-sm border-b border-gray-200 py-1.5 outline-none"
            >
              {langs.map((l) => (
                <option key={l} value={l}>
                  {labelFor(l)} ({l})
                </option>
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
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 w-24 shrink-0">繰り返し回数</label>
            <input
              type="range" min="1" max="5" step="1"
              value={settings.repeat}
              onChange={(e) => update({ repeat: parseInt(e.target.value, 10) })}
              className="flex-1"
            />
            <span className="text-xs text-gray-500 w-6 text-right">{settings.repeat}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 w-24 shrink-0">速度</label>
            <input
              type="range" min="0.5" max="1.3" step="0.05"
              value={settings.rate}
              onChange={(e) => update({ rate: parseFloat(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-gray-500 w-9 text-right">{settings.rate}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 w-24 shrink-0">間隔(秒)</label>
            <input
              type="range" min="0.5" max="4" step="0.5"
              value={settings.pause}
              onChange={(e) => update({ pause: parseFloat(e.target.value) })}
              className="flex-1"
            />
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

        <div className="mt-4 rounded-2xl border border-gray-200 p-6 text-center min-h-[110px] flex flex-col justify-center">
          {current ? (
            <>
              <div className="text-xs text-gray-400 mb-2">{pos + 1} / {order.length}</div>
              <div className="text-lg font-medium text-gray-900">{current.en}</div>
              {current.ja && <div className="text-sm text-gray-500 mt-1.5 italic">{current.ja}</div>}
            </>
          ) : (
            <div className="text-sm text-gray-400">フレーズを保存して再生してください</div>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => handleSkip(-1)}
            className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <SkipBack size={18} className="text-gray-600" />
          </button>
          <button
            onClick={handlePlay}
            disabled={items.length === 0}
            className="flex-1 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            {playing ? <Square size={16} /> : <Play size={16} />}
            <span className="text-sm font-medium">{playing ? "停止" : "再生"}</span>
          </button>
          <button
            onClick={() => handleSkip(1)}
            className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <SkipForward size={18} className="text-gray-600" />
          </button>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-gray-400 border-t border-gray-100 pt-4">
          端末の音声合成機能(Web Speech API)を使用。APIキー不要・無料。画面を閉じる/ロックすると再生は止まる場合があります。
        </p>
      </main>
    </div>
  );
}
