import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search, Trash2, Copy, Check, Volume2, ClipboardPaste, X } from "lucide-react";
import { useKikinagashi } from "../kikinagashiStore";

/* =========================================================================
   単語帳。英会話(聞き流し)の中の、フレーズとは別のリスト。
   一覧は調べた順(新しいものが上)。単語をタップすると全画面で意味を開く。
   覚えた記録は持たない。保存先はkikinagashiStoreのwords。
   ========================================================================= */

const SETTINGS_KEY = "kikinagashi-settings";

// 聞き流しで選んである声と速さをそのまま使う(設定を二重に持たせない)
function speak(text) {
  try {
    if (!text || !text.trim()) return;
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.trim());
    const voice = speechSynthesis.getVoices().find((v) => v.name === s.voiceName);
    if (voice) utter.voice = voice;
    utter.rate = s.rate ?? 0.85;
    speechSynthesis.speak(utter);
  } catch {
    // 読み上げが使えない端末では黙って何もしない
  }
}

// 貼り付け取り込み。1行1件。区切りは | ： : , タブ のどれでも読む。
function parsePaste(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const seps = ["|", "\t", "：", ":", ","];
      const sep = seps.find((x) => l.includes(x));
      if (!sep) return { en: l, ja: "" };
      const i = l.indexOf(sep);
      return { en: l.slice(0, i).trim(), ja: l.slice(i + 1).trim() };
    })
    .filter((w) => w.en);
}

export default function WordsPage() {
  const { words, addWord, addWords, updateWord, deleteWord } = useKikinagashi();

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const scrollMemo = useRef(0);

  // 調べた順(新しいものが上)
  const sorted = useMemo(
    () => [...words].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [words]
  );

  const allTags = useMemo(() => {
    const seen = [];
    words.forEach((w) => (w.tags || []).forEach((t) => { if (!seen.includes(t)) seen.push(t); }));
    return seen;
  }, [words]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted
      .filter((w) => !tagFilter || (w.tags || []).includes(tagFilter))
      .filter((w) => !q || w.en.toLowerCase().includes(q) || (w.ja || "").toLowerCase().includes(q));
  }, [sorted, query, tagFilter]);

  // 単語を見て戻ったとき、一覧の同じ位置に戻す
  useEffect(() => {
    if (openId) return;
    requestAnimationFrame(() => window.scrollTo(0, scrollMemo.current || 0));
  }, [openId]);

  function open(id) {
    scrollMemo.current = window.scrollY;
    setOpenId(id);
  }

  function create() {
    const v = draft.trim();
    if (!v) return;
    const w = addWord(v, "", []);
    setDraft("");
    scrollMemo.current = 0;
    setOpenId(w.id);
  }

  function runPaste() {
    const list = parsePaste(pasteText);
    if (list.length === 0) {
      setPasteMsg("Nothing to import");
      return;
    }
    addWords(list);
    setPasteText("");
    setPasteOpen(false);
    setPasteMsg("");
    setTagFilter(null);
    setQuery("");
    window.scrollTo(0, 0);
  }

  if (openId) {
    const w = words.find((x) => x.id === openId);
    if (!w) {
      setTimeout(() => setOpenId(null), 0);
      return null;
    }
    return (
      <WordDetail
        word={w}
        allTags={allTags}
        onBack={() => setOpenId(null)}
        onChange={(patch) => updateWord(w.id, patch)}
        onDelete={() => {
          deleteWord(w.id);
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 bg-app-raised rounded-xl px-3 py-2.5 mb-3">
          <Search size={15} className="text-ink-sub" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-ink-sub"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear">
              <X size={15} className="text-ink-sub" />
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  tagFilter === t
                    ? "border-gray-900 bg-gray-900 text-white font-semibold"
                    : "border-app-line text-ink-sub bg-app-surface"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="px-5 pb-40">
        {shown.length === 0 ? (
          <div className="mt-16 text-center text-sm text-ink-sub">
            {words.length === 0 ? "No words yet" : "No matches"}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((w) => (
              <button
                key={w.id}
                onClick={() => open(w.id)}
                className="w-full text-left bg-app-surface rounded-2xl border border-app-line px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold text-ink truncate">{w.en}</div>
                  {w.ja ? (
                    <div className="text-xs text-ink-sub mt-0.5 truncate">{w.ja.split("\n")[0]}</div>
                  ) : (
                    <div className="text-xs text-ink-sub/70 mt-0.5">No meaning</div>
                  )}
                  {(w.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {w.tags.map((t) => (
                        <span key={t} className="text-[10px] text-ink-sub bg-app-raised px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-ink-sub/70 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 z-20 bg-app-bg border-t border-app-line px-5 pt-3 pb-8">
        <div className="flex gap-2 max-w-md mx-auto pr-12">
          <button
            onClick={() => { setPasteOpen(true); setPasteMsg(""); }}
            className="w-12 flex-shrink-0 rounded-xl border border-app-line flex items-center justify-center"
            aria-label="Paste"
          >
            <ClipboardPaste size={17} className="text-ink-sub" />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) create(); }}
            placeholder="New word"
            className="flex-1 border border-app-line rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-gray-400"
          />
          <button
            onClick={create}
            disabled={!draft.trim()}
            className="bg-gray-900 disabled:bg-app-raised disabled:text-ink-sub text-white font-semibold rounded-xl px-4 text-[15px] whitespace-nowrap"
          >
            Add
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="fixed inset-0 z-[55] flex items-end bg-black/30" onClick={() => setPasteOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-app-surface rounded-t-3xl p-6 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold">Paste</h2>
              <button onClick={() => setPasteOpen(false)} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="Close">
                <X size={16} className="text-ink-sub" />
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => { setPasteText(e.target.value); setPasteMsg(""); }}
              placeholder={"Word | meaning, one per line\n\nresilient | 打たれ強い\nprocurement | 調達\nlead time | 納期"}
              rows={8}
              autoFocus
              className="w-full rounded-2xl border border-app-line p-4 text-sm outline-none focus:border-gray-400 resize-none placeholder:text-ink-sub/70"
            />
            {pasteMsg && <p className="text-sm text-red-500 mt-2">{pasteMsg}</p>}
            <button
              onClick={runPaste}
              disabled={!pasteText.trim()}
              className="mt-4 w-full h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold disabled:opacity-30"
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 全画面 ---------- */
function WordDetail({ word, allTags, onBack, onChange, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const enRef = useRef(null);
  const jaRef = useRef(null);

  // 欄の中でスクロールさせず、中身の高さに合わせて伸ばす(全文をそのまま出す)
  useEffect(() => {
    [enRef.current, jaRef.current].forEach((el) => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
  }, [word.en, word.ja]);

  async function copy() {
    try {
      await navigator.clipboard.writeText([word.en, word.ja].filter(Boolean).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function addTag(t) {
    const v = (t || "").trim();
    if (!v || (word.tags || []).includes(v)) return;
    onChange({ tags: [...(word.tags || []), v] });
    setTagInput("");
  }

  const suggest = allTags.filter((t) => !(word.tags || []).includes(t)).slice(0, 8);

  return (
    <div className="fixed inset-0 z-[60] bg-app-bg overflow-y-auto">
      <header className="px-5 pt-14 pb-2 flex items-center gap-2 sticky top-0 bg-app-bg z-10">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="Back">
          <ChevronLeft size={18} className="text-ink-sub" />
        </button>
        <div className="flex-1" />
        <button onClick={() => speak(word.en)} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="Speak">
          <Volume2 size={17} className="text-ink-sub" />
        </button>
        <button onClick={copy} className="w-9 h-9 rounded-full bg-app-raised flex items-center justify-center" aria-label="Copy">
          {copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} className="text-ink-sub" />}
        </button>
      </header>

      <main className="px-5 pb-24">
        <textarea
          ref={enRef}
          value={word.en}
          onChange={(e) => onChange({ en: e.target.value })}
          rows={1}
          placeholder="Word"
          className="w-full text-3xl font-bold text-ink bg-transparent focus:outline-none resize-none overflow-hidden leading-tight"
        />

        <div className="flex flex-wrap items-center gap-1.5 mt-2 mb-6">
          {(word.tags || []).map((t) => (
            <span key={t} className="text-[11px] bg-app-raised text-ink-sub px-2.5 py-1 rounded-full flex items-center gap-1">
              {t}
              <button onClick={() => onChange({ tags: word.tags.filter((x) => x !== t) })} className="text-ink-sub/70" aria-label={`Remove ${t}`}>
                ×
              </button>
            </span>
          ))}
          <button
            onClick={() => setTagOpen((o) => !o)}
            className="text-[11px] text-ink-sub border border-dashed border-app-line px-2.5 py-1 rounded-full"
          >
            + tag
          </button>
        </div>

        {tagOpen && (
          <div className="mb-6 -mt-4">
            <div className="flex gap-2">
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addTag(tagInput); }}
                placeholder="New tag"
                className="flex-1 border border-app-line rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
              />
              <button onClick={() => addTag(tagInput)} disabled={!tagInput.trim()} className="px-3 rounded-xl border border-app-line text-sm font-semibold disabled:opacity-40">
                Add
              </button>
            </div>
            {suggest.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggest.map((t) => (
                  <button key={t} onClick={() => addTag(t)} className="text-[11px] px-2.5 py-1 rounded-full border border-app-line text-ink-sub">
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={jaRef}
          value={word.ja || ""}
          onChange={(e) => onChange({ ja: e.target.value })}
          rows={1}
          placeholder="Meaning"
          className="w-full min-h-[40vh] bg-transparent text-[17px] leading-relaxed focus:outline-none resize-none overflow-hidden"
        />

        <div className="mt-10">
          {confirmDel ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-600 mb-3">Delete this word?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDel(false)} className="flex-1 py-2.5 rounded-xl border border-app-line bg-app-bg text-sm">
                  Cancel
                </button>
                <button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="w-full py-3 rounded-xl text-sm text-red-500 flex items-center justify-center gap-1.5">
              <Trash2 size={15} /> Delete word
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
