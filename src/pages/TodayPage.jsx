import { useState, useRef } from "react";
import { Layout } from "../components";
import { useData, todayStr, fileToCompressedDataUrl } from "../dataStore";
import { useConfirm } from "../components/ConfirmModal";
import { PhotoThumb } from "../components/PhotoViewer";
import { isDriveConnected, ensureAppFolder, uploadFileToProjectFolder, deleteProjectFile } from "../googleDrive";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatToday() {
  const d = new Date();
  return `${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

export default function TodayPage({ setTab }) {
  const { data, toggleTask, getMemo, setMemo, addMemoImages, removeMemoImage, updateMemoImageCategories } = useData();
  const confirm = useConfirm();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const today = todayStr();
  const tasks = data.tasks.filter((t) => t.date === today);
  const events = data.events.filter((e) => e.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const memo = getMemo(today);

  async function handlePickPhoto(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (!isDriveConnected()) {
      window.alert("写真の保存にはGoogle Drive連携が必要です。Settings画面で連携してください。");
      return;
    }
    setUploading(true);
    try {
      const folderId = await ensureAppFolder("Calendar写真");
      const uploaded = [];
      for (const file of files) {
        const result = await uploadFileToProjectFolder(file, folderId);
        uploaded.push({ src: result.thumbnailLink || result.webViewLink, driveFileId: result.id, categories: [] });
      }
      addMemoImages(today, uploaded);
    } catch {
      window.alert("写真のアップロードに失敗しました。通信状況を確認してもう一度お試しください。");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Layout title="Today" subtitle={formatToday()} current="today" setTab={setTab}>
      {/* Today's Schedule */}
      {events.length > 0 && (
        <section className="px-5 mb-8">
          <h2 className="text-lg font-semibold mb-4">Schedule</h2>
          <div className="space-y-3">
            {events.map((e) => (
              <div key={e.id} className="rounded-2xl border p-4">
                {e.time}　{e.title}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Today's Tasks */}
      <section className="px-5 mb-8">
        <h2 className="text-lg font-semibold mb-4">Today's Tasks</h2>

        <div className="space-y-3">
          {tasks.length === 0 && (
            <div className="rounded-2xl border p-4 text-gray-400">
              No tasks yet
            </div>
          )}
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTask(t.id)}
              className={`w-full text-left rounded-2xl border p-4 ${t.completed ? "text-gray-400 line-through" : ""}`}
            >
              {t.title}
            </button>
          ))}
        </div>
      </section>

      {/* Today's Memo */}
      <section className="px-5 pb-32">
        <h2 className="text-lg font-semibold mb-4">Memo</h2>

        <textarea
          value={memo.text}
          onChange={(e) => setMemo(today, e.target.value)}
          placeholder="Add Memo..."
          className="rounded-2xl border p-4 h-40 w-full mb-3"
        />
        {memo.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-3">
            {memo.images.map((src, i) => (
              <PhotoThumb
                key={i}
                img={src}
                size="w-16 h-16"
                confirm={confirm}
                availableCategories={data.settings.photoCategories}
                onDelete={async () => {
                  const im = memo.images[i];
                  if (im && typeof im === "object" && im.driveFileId) {
                    try { await deleteProjectFile(im.driveFileId); } catch {}
                  }
                  removeMemoImage(today, i);
                }}
                onCategoriesChange={(cats) => updateMemoImageCategories(today, i, cats)}
              />
            ))}
          </div>
        )}
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-2xl border px-4 py-2 text-sm">
          {uploading ? "Adding…" : "📷 Add Photo"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePickPhoto} className="hidden" />
      </section>
    </Layout>
  );
}
