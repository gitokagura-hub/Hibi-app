import { useState } from "react";
import { Paperclip, X, Upload } from "lucide-react";
import {
  isDriveConnected,
  ensureProjectFolder,
  uploadFileToProjectFolder,
  listProjectFiles,
  deleteProjectFile,
} from "../googleDrive";

/**
 * Sukima / Timeless Analogue 共通のDriveファイルギャラリー。
 * Daily BrainsのProjectsページと同じ仕組み（レコードごとにDriveサブフォルダを持つ）を
 * 汎用化したもの。呼び出し側は driveFolderId / driveFiles を自分のstoreで保持し、
 * onFolderId / onFilesChange で更新を受け取るだけでよい。
 */
export default function DriveGallery({
  entityId,
  entityName,
  driveFolderId,
  driveFiles,
  onFolderId,
  onFilesChange,
  accentColor = "#279a63",
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = isDriveConnected();

  async function ensureLoaded() {
    if (!connected) return;
    try {
      const folderId = await ensureProjectFolder(entityId, entityName, driveFolderId);
      if (folderId !== driveFolderId) onFolderId(folderId);
      const files = await listProjectFiles(folderId);
      onFilesChange(files);
    } catch {
      setError("Driveとの連携に失敗しました。Homeの接続状態を確認してください。");
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    if (!connected) {
      setError("先にGoogle Driveと連携してください（Home画面から）");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const folderId = await ensureProjectFolder(entityId, entityName, driveFolderId);
      if (folderId !== driveFolderId) onFolderId(folderId);
      const uploaded = [];
      for (const f of files) {
        uploaded.push(await uploadFileToProjectFolder(f, folderId));
      }
      onFilesChange([...uploaded, ...(driveFiles || [])]);
    } catch {
      setError("アップロードに失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(file) {
    if (!confirm(`「${file.name}」をDriveから削除しますか？`)) return;
    try {
      await deleteProjectFile(file.id);
      onFilesChange((driveFiles || []).filter((f) => f.id !== file.id));
    } catch {
      setError("削除に失敗しました。");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Paperclip size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-900">資料・写真（Drive）</span>
        </div>
        <label
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full text-white cursor-pointer"
          style={{ background: accentColor, opacity: busy ? 0.6 : 1 }}
        >
          <Upload size={13} />
          {busy ? "アップロード中…" : "追加"}
          <input type="file" multiple className="hidden" onChange={handleUpload} disabled={busy} />
        </label>
      </div>

      {!connected && (
        <p className="text-xs text-gray-400">Home画面でGoogle Driveと連携すると使えます</p>
      )}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {connected && (!driveFiles || driveFiles.length === 0) && (
        <button onClick={ensureLoaded} className="text-xs text-gray-400">
          まだファイルがありません（タップで再読み込み）
        </button>
      )}

      {driveFiles && driveFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {driveFiles.map((f) => (
            <a
              key={f.id}
              href={f.webViewLink}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center"
            >
              {f.thumbnailLink ? (
                <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-500 px-1 text-center break-all">{f.name}</span>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(f);
                }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
              >
                <X size={11} className="text-white" />
              </button>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
