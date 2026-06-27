import { useState, useRef, useEffect } from "react";
import { Layout, AIConnections } from "../components";
import { useData, todayStr, fileToCompressedDataUrl } from "../dataStore";

function deriveTitle(text) {
  const firstLine = text.split("\n")[0];
  return firstLine.length > 28 ? firstLine.slice(0, 28) + "…" : firstLine;
}

function VoiceCapture({ onClose, onSave }) {
  const [stage, setStage] = useState("listening"); // listening | review
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={stage === "review" ? onClose : undefined}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {stage === "listening" ? (
          <div className="flex flex-col items-center py-6">
            <div className="h-16 w-16 rounded-full border bg-white shadow-lg text-2xl flex items-center justify-center mb-4 animate-pulse">
              🎤
            </div>
            <p className="text-gray-500 text-sm mb-1">Listening…</p>
            <p className="text-gray-400 text-xs mb-6">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <button onClick={handleStop} className="rounded-2xl border px-6 py-3">
              Stop
            </button>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold mb-2">Conversation</h2>
            <p className="text-sm text-gray-500 mb-3">
              Voice transcription isn't connected yet — type a summary to save.
            </p>
            <textarea
              autoFocus
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="What did you talk about?"
              className="w-full rounded-2xl border p-4 h-32 mb-3"
            />
            <button
              onClick={() => onSave(transcript.trim() || "(voice note)")}
              className="w-full rounded-2xl bg-black text-white p-4"
            >
              Save to Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PasteChooser({ note, projects, onClose, onPasteToCalendar, onPasteToProject }) {
  const [mode, setMode] = useState(null);
  const [date, setDate] = useState(todayStr());

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-t-3xl p-6">
        {!mode && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to</h2>
            <div className="flex gap-3">
              <button onClick={() => setMode("calendar")} className="flex-1 rounded-2xl border p-5">
                Calendar
              </button>
              <button onClick={() => setMode("projects")} className="flex-1 rounded-2xl border p-5">
                Projects
              </button>
            </div>
          </>
        )}
        {mode === "calendar" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Calendar</h2>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-2xl border p-4 mb-3"
            />
            <button onClick={() => onPasteToCalendar(date)} className="w-full rounded-2xl bg-black text-white p-4">
              Add as Task
            </button>
            {note.images && note.images.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">Photos will be added to that day's Memo.</p>
            )}
          </>
        )}
        {mode === "projects" && (
          <>
            <h2 className="text-lg font-semibold mb-4">Paste to Project</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.length === 0 && <p className="text-gray-400">No projects yet</p>}
              {projects.map((p) => (
                <button key={p.id} onClick={() => onPasteToProject(p.id)} className="w-full text-left rounded-2xl border p-4">
                  {p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function NotesPage({ setTab }) {
  const { data, addNote, deleteNote, pasteNoteToCalendar, pasteNoteToProject } = useData();
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pasteTarget, setPasteTarget] = useState(null);
  const [selectedAI, setSelectedAI] = useState("ChatGPT");
  const fileInputRef = useRef(null);
  const sorted = [...data.notes].sort((a, b) => b.createdAt - a.createdAt);

  function handleAdd() {
    if (!text.trim() && pendingImages.length === 0) return;
    addNote(text.trim(), "text", pendingImages);
    setText("");
    setPendingImages([]);
  }

  async function handlePickPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const dataUrls = await Promise.all(files.map((f) => fileToCompressedDataUrl(f)));
      setPendingImages((prev) => [...prev, ...dataUrls]);
    } catch {
      // ignore unreadable files
    } finally {
      setUploading(false);
    }
  }

  return (
    <Layout title="Notes" subtitle="Ideas & Conversations" current="notes" setTab={setTab}>
      <div className="px-5">
        <div className="mb-4 overflow-x-auto">
          <AIConnections selected={selectedAI} onSelect={setSelectedAI} />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="New note..."
          rows={2}
          className="w-full rounded-2xl border p-4 mb-2"
        />
        {pendingImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {pendingImages.map((src, i) => (
              <div key={i} className="relative flex-shrink-0">
                <img src={src} alt="" className="w-16 h-16 object-cover rounded-xl border" />
                <button
                  onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black text-white text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={handleAdd} className="rounded-xl border px-4 py-2">
            Add
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-xl border px-4 py-2">
            {uploading ? "Adding…" : "📷 Photo"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePickPhoto} className="hidden" />
        </div>

        <div className="space-y-4">
          {sorted.length === 0 && <p className="text-gray-400">No notes yet</p>}
          {sorted.map((n) => (
            <div key={n.id} className="rounded-2xl border border-gray-200 p-4">
              <h2 className="font-medium mb-2">
                {n.source === "voice" ? "🎤 " : ""}{deriveTitle(n.text)}
              </h2>
              {n.text && <p className="text-sm text-gray-500 mb-3 whitespace-pre-wrap">{n.text}</p>}
              {n.images && n.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto mb-3">
                  {n.images.map((src, i) => (
                    <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border flex-shrink-0" />
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={() => setPasteTarget(n)} className="rounded-xl border px-4 py-2">
                  Paste
                </button>
                <button onClick={() => deleteNote(n.id)} className="text-gray-400 text-sm">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Voice */}
      <button
        onClick={() => setVoiceOpen(true)}
        className="fixed bottom-24 right-6 h-16 w-16 rounded-full border bg-white shadow-lg text-2xl"
      >
        🎤
      </button>

      {voiceOpen && (
        <VoiceCapture
          onClose={() => setVoiceOpen(false)}
          onSave={(t) => { addNote(t, "voice"); setVoiceOpen(false); }}
        />
      )}
      {pasteTarget && (
        <PasteChooser
          note={pasteTarget}
          projects={data.projects}
          onClose={() => setPasteTarget(null)}
          onPasteToCalendar={(date) => { pasteNoteToCalendar(pasteTarget, date); setPasteTarget(null); }}
          onPasteToProject={(pid) => { pasteNoteToProject(pasteTarget, pid); setPasteTarget(null); }}
        />
      )}
    </Layout>
  );
}
