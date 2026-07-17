import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, Play, Square, SkipBack, SkipForward, Shuffle, Repeat, Upload } from "lucide-react";
import { useSwipeBack } from "../useSwipeBack";

const STORAGE_KEY = "kikinagashi-list";
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

function parseList(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      const sep = l.includes("|") ? "|" : l.includes(",") ? "," : null;
      if (!sep) return { en: l, ja: "" };
      const idx = l.indexOf(sep);
      return { en: l.slice(0, idx).trim(), ja: l.slice(idx + 1).trim() };
    });
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

  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

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
      localStorage.setItem(STORAGE_KEY, text);
    } catch {}
  }, [text]);
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

    const utter = new SpeechSynthesisUtterance(item.en);
    const voice = allVoices.find((v) => v.name === settings.voiceName);
    if (voice) utter.voice = voice;
    utter.rate = settings.rate;

    utter.onend = () => {
      if (!playingRef.current) return;
      if (settings.readJa && item.ja) {
        const jaVoice = findJaVoice();
        const jaUtter = new SpeechSynthesisUtterance(item.ja);
        if (jaVoice) jaUtter.voice = jaVoice;
        jaUtter.rate = settings.rate;
        jaUtter.onend = () => afterOneRepeat();
        speechSynthesis.speak(jaUtter);
      } else {
        afterOneRepeat();
      }
    };
    speechSynthesis.speak(utter);
  }, [allVoices, settings, findJaVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  function afterOneRepeat() {
    if (!playingRef.current) return;
    repeatCountRef.current++;
    pauseTimerRef.current = setTimeout(() => {
      if (!playingRef.current) return;
      if (repeatCountRef.current < settings.repeat) {
        speakCurrent();
      } else {
        repeatCountRef.current = 0;
        let next = posRef.current + 1;
        if (next >= orderRef.current.length) {
          if (settings.loopAll) {
            const newOrder = settings.shuffle
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
    }, settings.pause * 1000);
  }

  function handlePlay() {
    if (playing) {
      stopAll();
      return;
    }
    const items = parseList(text);
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

  const fileInputRef = useRef(null);

  function handleFilePicked(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target.result || "");
      setText((prev) => {
        if (!prev.trim()) return content.trim();
        return prev.replace(/\s+$/, "") + "\n" + content.trim();
      });
    };
    reader.onerror = () => {
      alert("ファイルを読み込めませんでした。テキスト形式(.txt / .csv)のファイルを選んでください。");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  }

  return (
    <div className="min-h-screen bg-white relative">
      <button
        onClick={onHome}
        className="fixed bottom-6 left-5 z-30 w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">聞き流し</h1>
        <p className="mt-1 text-sm text-gray-500">英語フレーズ・単語をループ再生</p>
      </header>

      <main className="px-5 pb-32">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">リスト</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 px-2.5 py-1.5 rounded-full border border-indigo-100 bg-indigo-50 active:scale-95 transition-transform"
          >
            <Upload size={13} />
            ファイルから読み込む
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={handleFilePicked}
            className="hidden"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "1行に1フレーズ。日本語訳は | の後ろに書けます。\n\n例:\nHow have you been? | 最近どうしてた？\nIt slipped my mind. | うっかり忘れてた"
          }
          className="w-full min-h-[140px] rounded-2xl border border-gray-200 p-4 text-sm leading-relaxed text-gray-800 outline-none focus:border-gray-400"
        />
        <p className="mt-1.5 text-xs text-gray-400 px-1">形式: 英語 | 日本語、またはCSVの「英語,日本語」形式(訳は省略可)</p>

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
            <div className="text-sm text-gray-400">リストを入力して再生してください</div>
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
            className="flex-1 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
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
