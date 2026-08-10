import { useState, useRef, useEffect } from "react";
import { Layout, AIConnections } from "../components";
import { useData, todayStr, fileToCompressedDataUrl, fileToDataUrl, formatDateTime } from "../dataStore";
import { runAIOnNote } from "../aiAssist";
import { useConfirm } from "../components/ConfirmModal";

function deriveTitle(text) {
  const firstLine = text.split("\n")[0];
  return firstLine.length > 28 ? firstLine.slice(0, 28) + "…" : firstLine;
}

// Fullscreen single-photo viewer. Tap the backdrop or × to close.
function PhotoViewer({ images, initialIndex = 0, onClose }) {
  const list = images && images.length > 0 ? images : [];
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, list.length - 1)));
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const pinchState = useRef(null); // { startDist, startScale }
  const panState = useRef(null); // { startX, startY, startTx, startTy }
  const lastTapRef = useRef(0);
  const containerRef = useRef(null);
  const stripRef = useRef(null);

  // --- スワイプ(ページ送り)関連 ---
  // touchmove中はReactのstateを更新せず、DOMのtransformを直接書き換える
  // ことでフレーム落ちを避ける(Reactの再レンダーは1回のスワイプにつき
  // 開始・確定の2回程度で済む)。
  const swipe = useRef(null); // { startX, startY, lastX, lastT, v, dragging }
  const stateRef = useRef({ scale, index });
  const translateRef = useRef(translate);
  useEffect(() => { stateRef.current = { scale, index }; }, [scale, index]);
  useEffect(() => { translateRef.current = translate; }, [translate]);

  // 画像を切り替えたら毎回ズーム状態はリセット
  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    if (stripRef.current) {
      stripRef.current.style.transition = "none";
      stripRef.current.style.transform = "translate3d(0,0,0)";
    }
  }, [index]);

  function dist(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = window.innerWidth;

    function setStripX(x, withTransition) {
      const strip = stripRef.current;
      if (!strip) return;
      strip.style.transition = withTransition ? "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      strip.style.transform = `translate3d(${x}px,0,0)`;
    }

    function handleTouchStart(e) {
      if (e.touches.length === 2) {
        pinchState.current = { startDist: dist(e.touches), startScale: stateRef.current.scale };
        swipe.current = null;
      } else if (e.touches.length === 1) {
        if (stateRef.current.scale > 1.05) {
          panState.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, baseX: translateRef.current.x, baseY: translateRef.current.y };
        } else {
          // 等倍(ズームしていない)時のみ、横スワイプで前後の写真に移動できるようにする
          const now = performance.now();
          swipe.current = {
            startX: e.touches[0].clientX, startY: e.touches[0].clientY,
            lastX: e.touches[0].clientX, lastT: now, v: 0, dragging: false,
          };
        }
      }
    }

    function handleTouchMove(e) {
      if (e.touches.length === 2 && pinchState.current) {
        e.preventDefault();
        const newScale = Math.min(4, Math.max(0.5, pinchState.current.startScale * (dist(e.touches) / pinchState.current.startDist)));
        setScale(newScale);
      } else if (e.touches.length === 1 && panState.current) {
        e.preventDefault();
      } else if (e.touches.length === 1 && swipe.current) {
        const s = swipe.current;
        const x = e.touches[0].clientX;
        const dx = x - s.startX;
        const dy = e.touches[0].clientY - s.startY;
        if (!s.dragging && Math.abs(dx) < Math.abs(dy) + 10) return; // 方向確定前は何もしない(縦スクロール等との誤判定回避)
        s.dragging = true;
        e.preventDefault();

        // 端(最初/最後の写真)でさらに引っ張ろうとしたら、ゴムのような抵抗をかける
        let dragX = dx;
        if ((stateRef.current.index === 0 && dx > 0) || (stateRef.current.index === list.length - 1 && dx < 0)) {
          dragX = dx * 0.35;
        }

        const now = performance.now();
        const dt = now - s.lastT;
        if (dt > 0) s.v = (x - s.lastX) / dt; // px/ms、直近の瞬間速度
        s.lastX = x;
        s.lastT = now;
        s.finalDragX = dragX;

        setStripX(dragX, false);
      }
    }

    function handleTouchEnd(e) {
      pinchState.current = null;
      panState.current = null;

      if (swipe.current && swipe.current.dragging) {
        const s = swipe.current;
        const dragX = s.finalDragX || 0;
        const commit = Math.abs(dragX) > W * 0.35 || Math.abs(s.v) > 0.5;
        const dir = (dragX < 0 || s.v < -0.5) ? -1 : 1; // -1: 次へ(左スワイプ), 1: 前へ(右スワイプ)
        const atEdge = (dir === -1 && stateRef.current.index === list.length - 1) || (dir === 1 && stateRef.current.index === 0);

        if (commit && !atEdge) {
          const target = dir === -1 ? -W : W;
          setStripX(target, true);
          setTimeout(() => {
            setIndex((i) => Math.max(0, Math.min(list.length - 1, i - dir)));
          }, 400);
        } else {
          // 閾値未満、または端でこれ以上進めない場合はゴムのように元へ戻す
          setStripX(0, true);
        }
      }
      swipe.current = null;

      if (e.touches.length === 0) {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
          if (Math.abs(stateRef.current.scale - 1) > 0.05) {
            setScale(1);
            setTranslate({ x: 0, y: 0 });
          } else {
            setScale(2);
          }
        }
        lastTapRef.current = now;
      }
    }

    // { passive: false } が肝: これが無いとブラウザによっては
    // preventDefault()が無視され、ピンチ操作がSafari標準のページ
    // ズームや意図しないジェスチャーとして処理されてしまう。
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  // ズーム中のパン操作(1本指ドラッグ)は、写真単体のtransformなので
  // 従来通りReact stateで問題ない(スワイプのようにフレーム毎の再描画
  // コストを気にする必要が薄い、動くのは1枚だけのため)。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function handlePanMove(e) {
      if (e.touches.length === 1 && panState.current && stateRef.current.scale > 1.05) {
        const dx = e.touches[0].clientX - panState.current.startX;
        const dy = e.touches[0].clientY - panState.current.startY;
        setTranslate({ x: panState.current.baseX + dx, y: panState.current.baseY + dy });
      }
    }
    el.addEventListener("touchmove", handlePanMove, { passive: false });
    return () => el.removeEventListener("touchmove", handlePanMove);
  }, []);

  const current = list[index];
  if (!current) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[90] bg-black/95 overflow-hidden touch-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={stripRef}
        className="flex items-center h-full"
        style={{ width: "300vw", marginLeft: "-100vw", willChange: "transform", transform: "translate3d(0,0,0)" }}
      >
        {[index - 1, index, index + 1].map((i) => (
          <div key={i} className="w-screen h-full flex items-center justify-center p-8 shrink-0">
            {list[i] && (
              <img
                src={list[i]}
                alt=""
                draggable={false}
                className="max-w-full max-h-full object-contain rounded-2xl"
                style={i === index ? { transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` } : undefined}
              />
            )}
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1.5">
          {list.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-14 right-5 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center">×</button>
    </div>
  );
}

// A tappable thumbnail: tap opens the fullscreen viewer, long-press (600ms)
// asks for confirmation and deletes if onDelete is provided. Used for both
// the note-list preview (no delete) and the composer preview (deletable).
function PhotoThumb({ src, images, index = 0, onDelete, confirm, size = "w-24 h-24" }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  function handleTouchStart(e) {
    e.stopPropagation();
    longPressed.current = false;
    if (!onDelete) return;
    pressTimer.current = setTimeout(async () => {
      longPressed.current = true;
      if (await confirm("この写真を削除しますか？", { confirmLabel: "削除する", danger: true })) onDelete();
    }, 600);
  }
  function handleTouchEnd(e) {
    e.stopPropagation();
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!longPressed.current) setViewerOpen(true);
  }

  return (
    <>
      <img
        src={src}
        alt=""
        className={`${size} object-cover rounded-xl border flex-shrink-0`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      />
      {viewerOpen && <PhotoViewer images={images && images.length > 0 ? images : [src]} initialIndex={index} onClose={() => setViewerOpen(false)} />}
    </>
  );
}

function PdfPreview({ file }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let url = null;
    setFailed(false);
    setBlobUrl(null);
    try {
      // data:application/pdf;base64,xxxx... をBlobに変換してobject URLを作る。
      // iOS Safariはiframe src への巨大なdata: URLの直渡しが不安定
      // (静かに描画が止まることがある)なため、Blob URL経由にする。
      const res = fetch(file.dataUrl);
      res
        .then((r) => r.blob())
        .then((blob) => {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        })
        .catch(() => setFailed(true));
    } catch {
      setFailed(true);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.dataUrl]);

  if (failed) {
    return <p className="text-xs text-gray-400 mt-1">プレビューを表示できませんでした。上のファイル名をタップして開いてください。</p>;
  }
  if (!blobUrl) {
    return <div className="w-full rounded-lg border mt-1 flex items-center justify-center text-xs text-gray-400 h-20">読み込み中...</div>;
  }

  // iOS Safariのiframeは、埋め込み枠だと自前のCSS高さ指定を無視して
  // 中身のPDF実寸まで広がってしまい、枠内に収める調整がうまくいかな
  // かった。写真ビューアーと同じ「普段は小さいカード、タップで
  // フルスクリーン」方式に変更。フルスクリーン(画面いっぱい)なら
  // iOSのPDFビューア標準のピンチズーム操作がそのまま自然に使える。
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border mt-1 h-20 flex items-center justify-center gap-2 text-xs text-gray-500 bg-gray-50 active:bg-gray-100"
      >
        📄 タップしてPDFを表示
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col" onClick={() => setOpen(false)}>
          <div className="flex items-center justify-between px-4 pt-14 pb-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-white text-sm truncate">{file.name}</span>
            <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center shrink-0 ml-2">×</button>
          </div>
          <object data={blobUrl} type="application/pdf" className="flex-1 w-full bg-white" onClick={(e) => e.stopPropagation()}>
            <p className="text-white text-sm p-6">PDFを表示できませんでした。</p>
          </object>
        </div>
      )}
    </>
  );
}

function VoiceCapture({ onClose, onSave }) {
  const [stage, setStage] = useState("listening");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const timerRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((stream) => { mediaRef.current = stream; }).catch(() => {});
    return () => {
      clearInterval(timerRef.current);
      mediaRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleStop() {
    clearInterval(timerRef.current);
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    setStage("review");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={stage === "review" ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {stage === "listening" ? (
          <div className="flex flex-col items-center py-6">
            <div className="h-16 w-16 rounded-full border bg-white shadow-lg text-2xl flex items-center justify-center mb-4 animate-pulse">🎤</div>
            <p className="text-gray-500 text-sm mb-1">Listening…</p>
            <p className="text-gray-400 text-xs mb-6">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <button onClick={handleStop} className="rounded-2xl border px-6 py-3">Stop</button>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold mb-2">Conversation</h2>
            <p className="text-sm text-gray-500 mb-3">Voice transcription isn't connected yet — type a summary to save.</p>
            <textarea
              autoFocus
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="What did you talk about?"
              className="w-full rounded-2xl border p-4 h-32 mb-3"
            />
            <button onClick={() => onSave(transcript.trim() || "(voice note)")} className="w-full rounded-2xl bg-black text-white p-4">
              Save to Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PasteChooser({ note, mode: initialMode, projects, onClose, onPasteToCalendar, onPasteToProject }) {
  const [mode, setMode] = useState(initialMode || null);
  const [date, setDate] = useState(todayStr());

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {mode === "calendar" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Calendar</h2>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl border p-4 mb-3" />
            <button onClick={() => onPasteToCalendar(date)} className="w-full rounded-2xl bg-black text-white p-4">Add as Task</button>
          </>
        )}
        {mode === "projects" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Project</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.length === 0 && <p className="text-gray-400">No projects yet</p>}
              {projects.map((p) => (
                <button key={p.id} onClick={() => onPasteToProject(p.id)} className="w-full text-left rounded-2xl border p-4">{p.name}</button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectPickerSheet({ projects, onClose, onPick }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        <h2 className="text-lg font-semibold mb-4">送信先のプロジェクトを選択</h2>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {projects.length === 0 && <p className="text-gray-400">プロジェクトがまだありません</p>}
          {projects.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="w-full text-left rounded-2xl border p-4">📁 {p.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIAssistSheet({ provider, apiKeyMissing, onClose, onRun, onApply }) {
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function handleRun() {
    if (!instruction.trim()) return;
    setRunning(true);
    setError("");
    setResult("");
    try {
      const output = await onRun(instruction);
      setResult(output);
    } catch (err) {
      setError(err.message === "NO_API_KEY" ? "APIキーが未設定です。Settingsで設定してください。" : "AI呼び出しに失敗しました: " + err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <h2 className="text-lg font-semibold mb-1">✨ {provider}に頼む</h2>
        <p className="text-xs text-gray-400 mb-4">このノートの内容について、やってほしいことを書いてください</p>

        {apiKeyMissing ? (
          <p className="text-sm text-red-500 mb-3">
            {provider === "ChatGPT"
              ? "ChatGPTはまだ接続されていません。上のピルでClaudeかGeminiを選んでください。"
              : `${provider}のAPIキーが未設定です。Settings画面で設定してください。`}
          </p>
        ) : (
          <>
            <textarea
              autoFocus
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例：要約して／タスクに分解して／英語に訳して"
              className="w-full rounded-2xl border p-4 h-24 mb-3 text-sm"
            />
            <button
              onClick={handleRun}
              disabled={running || !instruction.trim()}
              className="w-full rounded-2xl bg-black text-white p-3.5 font-semibold mb-3 disabled:opacity-40"
            >
              {running ? "処理中…" : "実行する"}
            </button>

            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

            {result && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-3">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{result}</p>
              </div>
            )}

            {result && (
              <div className="flex gap-2">
                <button onClick={() => onApply(result, "replace")} className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold">置き換える</button>
                <button onClick={() => onApply(result, "append")} className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold">下に追記</button>
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="w-full text-center text-gray-400 text-sm mt-4">閉じる</button>
      </div>
    </div>
  );
}

function FullScreenComposer({
  text, setText, pendingImages, setPendingImages, pendingFiles, setPendingFiles,
  uploading, onPickPhoto, onPickFile, onVoice, onSave, onSend, onClose, isEditing, onAIAssist, confirm,
}) {
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500">閉じる</button>
        <span className="font-semibold">{isEditing ? "Edit Note" : "New Note"}</span>
        {text ? (
          <button onClick={handleCopy} className="text-sm text-gray-500">
            {copied ? "✅ コピー済" : "📋 コピー"}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="思いつきやアイデアを書き出す（壁打ち）..."
        className="flex-1 w-full px-5 py-4 text-[16px] outline-none resize-none"
      />

      <div className="px-5">
        {pendingImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {pendingImages.map((src, i) => (
              <PhotoThumb
                key={i}
                src={src}
                images={pendingImages}
                index={i}
                confirm={confirm}
                onDelete={() => setPendingImages((p) => p.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
        {pendingFiles.length > 0 && (
          <div className="space-y-2 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i}>
                <div className="flex items-center justify-between rounded-lg border p-2 text-xs">
                  <span className="truncate">📄 {f.name}</span>
                  <button onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))} className="text-gray-400 ml-2">×</button>
                </div>
                {(f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf")) && <PdfPreview file={f} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3 mb-3">
          <button onClick={onAIAssist} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">✨ AIに頼む</button>
          <button onClick={onVoice} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">🎤 ボイチャ</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">📎 ファイル</button>
          <button onClick={() => photoInputRef.current?.click()} disabled={uploading} className="rounded-xl border px-2.5 py-1.5 text-xs bg-white whitespace-nowrap">📷 写真</button>
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhoto} className="hidden" />
        <input ref={fileInputRef} type="file" multiple onChange={onPickFile} className="hidden" />
        <div className="flex gap-2">
          <button onClick={onSave} className="flex-1 rounded-xl border px-4 py-3 text-sm font-semibold">保存</button>
          {!isEditing && (
            <button onClick={onSend} className="flex-1 rounded-xl bg-black text-white px-4 py-3 text-sm font-semibold">📤 Send</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotesPage({ setTab }) {
  const {
    data, addNote, deleteNote, updateNote, pasteNoteToCalendar, pasteNoteToProject, sendToProject,
    space, teamData, teamLoading, teamError,
    addTeamNoteAction, updateTeamNoteAction, deleteTeamNoteAction,
  } = useData();
  const isTeam = space === "team";
  const confirm = useConfirm();
  const DRAFT_KEY = "notes-composer-draft";
  const [text, setText] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")?.text || ""; } catch { return ""; }
  });
  const [pendingImages, setPendingImages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")?.images || []; } catch { return []; }
  });
  const [pendingFiles, setPendingFiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")?.files || []; } catch { return []; }
  });
  const [uploading, setUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(() => {
    // 下書きに何か残っていれば、次回起動時に自動でComposerを開いて
    // 気づけるようにする(カメラ起動→アプリ再読み込みで消えたように
    // 見えていた写真も、ここで復元されて再表示される)。
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      return !!(d && (d.text?.trim() || (d.images || []).length || (d.files || []).length));
    } catch { return false; }
  });
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState(null);
  const [pasteMode, setPasteMode] = useState(null);
  const [selectedAI, setSelectedAI] = useState("Gemini");
  const [now, setNow] = useState(Date.now());
  const sorted = isTeam
    ? [...teamData.notes].sort((a, b) => b.createdAt - a.createdAt)
    : [...data.notes].sort((a, b) => b.createdAt - a.createdAt);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function resetComposer() {
    setText("");
    setPendingImages([]);
    setPendingFiles([]);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  // 下書きを自動保存(カメラ起動でアプリが裏に回っている間に再読み込みされても、
  // 撮った写真や入力中の文章が消えないようにする)。編集中の既存ノート
  // (editingNoteId有り)は下書き扱いにしない。
  useEffect(() => {
    if (editingNoteId) return;
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      return;
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, images: pendingImages, files: pendingFiles }));
    } catch {}
  }, [text, pendingImages, pendingFiles, editingNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSaveNote() {
    if (isTeam) {
      if (editingNoteId) updateTeamNoteAction(editingNoteId, text.trim());
      else if (text.trim()) addTeamNoteAction(text.trim());
      resetComposer();
      setEditingNoteId(null);
      setComposerOpen(false);
      return;
    }
    if (editingNoteId) {
      updateNote(editingNoteId, text.trim(), pendingImages, pendingFiles);
      resetComposer();
      setEditingNoteId(null);
      setComposerOpen(false);
      return;
    }
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    addNote(text.trim(), "text", pendingImages, pendingFiles);
    resetComposer();
    setComposerOpen(false);
  }

  function handleOpenNote(n) {
    setEditingNoteId(n.id);
    setText(n.text || "");
    setPendingImages(n.images || []);
    setPendingFiles(n.files || []);
    setComposerOpen(true);
  }

  function handleOpenNewComposer() {
    setEditingNoteId(null);
    resetComposer();
    setComposerOpen(true);
  }

  function handleCloseComposer() {
    setEditingNoteId(null);
    resetComposer();
    setComposerOpen(false);
  }

  function handleSendPick(projectId) {
    if (!text.trim() && pendingImages.length === 0 && pendingFiles.length === 0) return;
    sendToProject(projectId, text.trim(), pendingImages, pendingFiles);
    resetComposer();
    setProjectPickerOpen(false);
    setComposerOpen(false);
  }

  async function handlePickPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const dataUrls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      setPendingImages((prev) => [...prev, ...dataUrls]);
    } catch {} finally { setUploading(false); }
  }

  async function handlePickFile(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const items = await Promise.all(files.map((f) => fileToDataUrl(f)));
      setPendingFiles((prev) => [...prev, ...items]);
    } catch {} finally { setUploading(false); }
  }

  // Maps the AIConnections pill selection to an aiAssist provider + the
  // matching key from Settings. ChatGPT isn't wired up to aiAssist yet.
  const aiProviderMap = { Claude: "claude", Gemini: "gemini" };
  const aiProvider = aiProviderMap[selectedAI] || null;
  const aiApiKey = aiProvider === "claude" ? data?.settings?.claudeKey : aiProvider === "gemini" ? data?.settings?.geminiKey : "";
  const aiKeyMissing = !aiProvider || !aiApiKey;

  async function handleAIRun(instruction) {
    if (!aiProvider) throw new Error("UNSUPPORTED_PROVIDER");
    return runAIOnNote({ provider: aiProvider, apiKey: aiApiKey, noteText: text, instruction });
  }

  function handleAIApply(result, mode) {
    if (mode === "replace") setText(result);
    else setText((prev) => (prev ? prev + "\n\n" + result : result));
    setAiAssistOpen(false);
  }

  return (
    <Layout title="Notes" subtitle="Ideas & Conversations" current="notes" setTab={setTab}>
      <div className="px-5">
        <div className="mb-4 overflow-x-auto">
          <AIConnections selected={selectedAI} onSelect={setSelectedAI} />
        </div>

        <button
          onClick={handleOpenNewComposer}
          className="w-full text-left rounded-3xl border p-4 mb-6 text-gray-400 text-[15px]"
        >
          {isTeam ? "チームに共有するメモを書く..." : "思いつきやアイデアを書き出す（壁打ち）..."}
        </button>

        {isTeam && teamError && <p className="text-xs text-red-500 mb-3">{teamError}</p>}
        {isTeam && teamLoading && <p className="text-xs text-gray-400 mb-3">同期中…</p>}

        <div className="space-y-4 pb-10">
          {sorted.length === 0 && <p className="text-gray-400">No notes yet</p>}
          {sorted.map((n) => (
            <div key={n.id} className={`rounded-2xl border p-4 ${isTeam ? "border-blue-100 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
              <button onClick={() => handleOpenNote(n)} className="w-full text-left">
                {n.text && (
                  <p className="text-[15px] mb-3 leading-relaxed">
                    {n.source === "voice" ? "🎤 " : ""}
                    {(() => {
                      const flat = n.text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
                      return flat.length > 60 ? flat.slice(0, 60) + "…" : flat;
                    })()}
                  </p>
                )}
                {n.images && n.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto mb-3">
                    {n.images.map((src, i) => (
                      <PhotoThumb key={i} src={src} images={n.images} index={i} />
                    ))}
                  </div>
                )}
                {n.files && n.files.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {n.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.dataUrl}
                        download={f.name}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-xs rounded-lg border p-2 truncate text-indigo-600 active:bg-gray-50"
                      >
                        📄 {f.name}
                      </a>
                    ))}
                  </div>
                )}
              </button>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-gray-400 font-semibold">
                  {formatDateTime(n.createdAt)}
                  {isTeam && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
                      ● {n.author || "名無し"}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleOpenNote(n)} className="bg-white border border-gray-300 text-gray-700 rounded-lg px-2.5 py-1 text-xs font-medium">Edit</button>
                  {!isTeam && (
                    <>
                      <button onClick={() => { setPasteTarget(n); setPasteMode("calendar"); }} className="bg-white border border-gray-300 text-gray-700 rounded-lg px-2.5 py-1 text-xs font-medium">To Calendar</button>
                      <button onClick={() => { setPasteTarget(n); setPasteMode("projects"); }} className="bg-white border border-gray-300 text-gray-700 rounded-lg px-2.5 py-1 text-xs font-medium">To Project</button>
                    </>
                  )}
                  <button onClick={async () => { if (await confirm("このノートを削除しますか？", { confirmLabel: "削除する", danger: true })) (isTeam ? deleteTeamNoteAction(n.id) : deleteNote(n.id)); }} className="text-gray-400 text-xs px-1">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {composerOpen && (
        <FullScreenComposer
          text={text} setText={setText}
          pendingImages={pendingImages} setPendingImages={setPendingImages}
          pendingFiles={pendingFiles} setPendingFiles={setPendingFiles}
          uploading={uploading}
          onPickPhoto={handlePickPhoto}
          onPickFile={handlePickFile}
          onVoice={() => setVoiceOpen(true)}
          onSave={handleSaveNote}
          onSend={() => setProjectPickerOpen(true)}
          onClose={handleCloseComposer}
          isEditing={!!editingNoteId}
          onAIAssist={() => setAiAssistOpen(true)}
          confirm={confirm}
        />
      )}
      {aiAssistOpen && (
        <AIAssistSheet
          provider={selectedAI}
          apiKeyMissing={aiKeyMissing}
          onClose={() => setAiAssistOpen(false)}
          onRun={handleAIRun}
          onApply={handleAIApply}
        />
      )}
      {projectPickerOpen && (
        <ProjectPickerSheet
          projects={data.projects}
          onClose={() => setProjectPickerOpen(false)}
          onPick={handleSendPick}
        />
      )}
      {voiceOpen && (
        <VoiceCapture onClose={() => setVoiceOpen(false)} onSave={(t) => { addNote(t, "voice"); setVoiceOpen(false); }} />
      )}
      {pasteTarget && (
        <PasteChooser
          note={pasteTarget}
          mode={pasteMode}
          projects={data.projects}
          onClose={() => { setPasteTarget(null); setPasteMode(null); }}
          onPasteToCalendar={(date) => { pasteNoteToCalendar(pasteTarget, date); setPasteTarget(null); setPasteMode(null); }}
          onPasteToProject={(pid) => { pasteNoteToProject(pasteTarget, pid); setPasteTarget(null); setPasteMode(null); }}
        />
      )}
    </Layout>
  );
}
