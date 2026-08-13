import { useState, useMemo, useRef } from "react";
import { FileText, Folder, Plus, ChevronLeft, X, Search, MoreHorizontal } from "lucide-react";
import { Layout } from "../components";
import { useConfirm } from "../components/ConfirmModal";
import { useData, fileToDataUrl } from "../dataStore";

function formatBytes(dataUrl) {
  if (!dataUrl) return "";
  // data:xxx;base64,yyyy... のyyyy部分の長さからおおよそのバイト数を逆算
  const base64 = dataUrl.split(",")[1] || "";
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function TileMenu({ onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-0.5 right-0.5 z-10">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 rounded-full bg-app-bg/80 flex items-center justify-center"
        aria-label="メニュー"
      >
        <MoreHorizontal size={14} className="text-ink-sub" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-7 z-30 w-36 bg-app-surface border border-app-line rounded-xl overflow-hidden shadow-lg">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
              className="w-full px-3 py-2.5 text-xs text-left"
            >
              名前を変更
            </button>
            <div className="h-px bg-app-line" />
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
              className="w-full px-3 py-2.5 text-xs text-left text-red-500"
            >
              削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FileTile({ file, onClick, onRename, onDelete }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      {onRename && onDelete && <TileMenu onRename={onRename} onDelete={onDelete} />}
      <button onClick={onClick} className="w-full flex flex-col items-center text-center">
        <div className="w-full aspect-square rounded-xl bg-app-surface border border-app-line flex items-center justify-center mb-1.5">
          <FileText size={28} className="text-ink-sub" />
        </div>
        <div className="text-xs w-full truncate">{file.name}</div>
        <div className="text-[10px] text-ink-sub">{formatDate(file.createdAt)}{file.dataUrl ? ` ・ ${formatBytes(file.dataUrl)}` : ""}</div>
      </button>
    </div>
  );
}

function FolderTile({ folder, count, onClick, onRename, onDelete }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <TileMenu onRename={onRename} onDelete={onDelete} />
      <button onClick={onClick} className="w-full flex flex-col items-center text-center">
        <div className="w-full aspect-square flex items-center justify-center mb-1.5">
          <Folder size={52} className="text-sky-400" fill="currentColor" fillOpacity={0.15} />
        </div>
        <div className="text-xs w-full truncate">{folder.name}</div>
        <div className="text-[10px] text-ink-sub">{count}項目</div>
      </button>
    </div>
  );
}

export default function SearchPage({ setTab }) {
  const { data, addLibraryFiles, deleteLibraryFile, renameLibraryFile, addLibraryFolder, deleteLibraryFolder, renameLibraryFolder } = useData();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [openFolderId, setOpenFolderId] = useState(null); // null=ルート
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadStatus, setUploadStatus] = useState(null); // { type: "ok"|"error", text }
  const [renameTarget, setRenameTarget] = useState(null); // { kind: "file"|"folder", id, name }
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef(null);

  // 全ファイル(Notes/Calendarメモ/Projectsのメモ)を横断的に集約する。
  // これらは常にルート直下(folderIdなし)として扱う。
  const collectedFiles = useMemo(() => {
    const items = [];
    (data.notes || []).forEach((n) =>
      (n.files || []).forEach((f) => items.push({ ...f, source: "Notes", createdAt: n.createdAt }))
    );
    Object.entries(data.memos || {}).forEach(([date, memo]) =>
      (memo.files || []).forEach((f) => items.push({ ...f, source: `Calendar / ${date}`, createdAt: new Date(date).getTime() }))
    );
    (data.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.files || []).forEach((f) => items.push({ ...f, source: `Projects / ${p.name}`, createdAt: it.createdAt }))
      )
    );
    return items;
  }, [data]);

  const libraryFiles = data.libraryFiles || [];
  const libraryFolders = data.libraryFolders || [];

  // Files画面で開いているフォルダの中身
  const folderFiles = openFolderId ? libraryFiles.filter((f) => f.folderId === openFolderId) : [];
  const currentFolder = libraryFolders.find((f) => f.id === openFolderId);

  // ルート表示: 集約ファイル + Files画面直下(folderIdなし)のファイル + フォルダ一覧
  const rootFiles = useMemo(() => [
    ...collectedFiles,
    ...libraryFiles.filter((f) => !f.folderId),
  ].sort((a, b) => b.createdAt - a.createdAt), [collectedFiles, libraryFiles]);

  const ql = q.trim().toLowerCase();
  const filteredRootFiles = ql ? rootFiles.filter((f) => (f.name || "").toLowerCase().includes(ql)) : rootFiles;
  const filteredFolders = ql ? libraryFolders.filter((f) => f.name.toLowerCase().includes(ql)) : libraryFolders;
  const filteredFolderFiles = ql ? folderFiles.filter((f) => (f.name || "").toLowerCase().includes(ql)) : folderFiles;

  async function handlePickFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setAddMenuOpen(false);
    if (!files.length) return;

    const MAX_BYTES = 8 * 1024 * 1024; // 8MB上限
    const tooLarge = files.filter((f) => f.size > MAX_BYTES);
    const okFiles = files.filter((f) => f.size <= MAX_BYTES);

    try {
      const results = await Promise.allSettled(okFiles.map((f) => fileToDataUrl(f)));
      const succeeded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failedCount = results.filter((r) => r.status === "rejected").length;

      if (succeeded.length > 0) addLibraryFiles(succeeded, openFolderId);

      const parts = [];
      if (succeeded.length > 0) parts.push(`${succeeded.length}件追加しました`);
      if (tooLarge.length > 0) parts.push(`${tooLarge.map((f) => f.name).join("、")}は大きすぎるため追加できません(8MB上限)`);
      if (failedCount > 0) parts.push(`${failedCount}件の読み込みに失敗しました`);

      if (parts.length > 0) {
        setUploadStatus({ type: succeeded.length > 0 && failedCount === 0 && tooLarge.length === 0 ? "ok" : "error", text: parts.join(" / ") });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    } catch (err) {
      setUploadStatus({ type: "error", text: `追加に失敗しました: ${err?.message || "不明なエラー"}` });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    addLibraryFolder(name);
    setNewFolderName("");
    setNewFolderOpen(false);
  }

  function startRenameFile(f) {
    setRenameTarget({ kind: "file", id: f.id, name: f.name });
    setRenameValue(f.name);
  }
  function startRenameFolder(folder) {
    setRenameTarget({ kind: "folder", id: folder.id, name: folder.name });
    setRenameValue(folder.name);
  }
  function commitRename() {
    const name = renameValue.trim();
    if (!name || !renameTarget) { setRenameTarget(null); return; }
    if (renameTarget.kind === "file") renameLibraryFile(renameTarget.id, name);
    else renameLibraryFolder(renameTarget.id, name);
    setRenameTarget(null);
  }
  async function handleDeleteFile(f) {
    if (await confirm(`「${f.name}」を削除しますか？`, { confirmLabel: "削除する", danger: true })) {
      deleteLibraryFile(f.id);
    }
  }
  async function handleDeleteFolder(folder) {
    if (await confirm(`「${folder.name}」を削除しますか？中のファイルもすべて削除されます。`, { confirmLabel: "削除する", danger: true })) {
      deleteLibraryFolder(folder.id);
    }
  }

  function dataUrlToBlob(dataUrl) {
    const [head, b64] = dataUrl.split(",");
    const mime = head.match(/data:(.*?);/)?.[1] || "application/octet-stream";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function openFile(f) {
    if (!f.dataUrl) return;
    const blob = dataUrlToBlob(f.dataUrl);
    const type = blob.type || "";

    // PDF/画像はSafariがネイティブにプレビューできるため、共有シートを
    // 経由せず直接新規タブで開く方が「タップ→即座に表示」に近い体験になる。
    if (type === "application/pdf" || type.startsWith("image/")) {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }

    // docx等、Safariが直接描画できない形式はWeb Share経由が最も確実
    // (共有シートから「Pagesで開く」「ファイルに保存」等が選べる)。
    const file = new File([blob], f.name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <Layout title={currentFolder ? currentFolder.name : "Files"} current="search" setTab={setTab} hideSpaceSwitcher>
      <div className="px-5">
        {openFolderId && (
          <button onClick={() => setOpenFolderId(null)} className="flex items-center gap-1 text-sm text-ink-sub mb-3">
            <ChevronLeft size={16} /> Files
          </button>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-sub" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="検索"
              className="w-full rounded-full bg-app-surface px-4 py-2.5 pl-10 text-sm outline-none"
            />
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-app-raised text-ink flex items-center justify-center"
              aria-label="メニュー"
            >
              <Plus size={18} />
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-30 w-44 bg-app-surface border border-app-line rounded-2xl overflow-hidden shadow-lg">
                  <button
                    onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left"
                  >
                    <FileText size={16} /> ファイルを追加
                  </button>
                  {!openFolderId && (
                    <>
                      <div className="h-px bg-app-line" />
                      <button
                        onClick={() => { setAddMenuOpen(false); setNewFolderOpen(true); }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left"
                      >
                        <Folder size={16} /> 新規フォルダ
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            <input ref={fileInputRef} type="file" multiple onChange={handlePickFiles} className="hidden" />
          </div>
        </div>

        {uploadStatus && (
          <p className={`text-xs mb-4 ${uploadStatus.type === "ok" ? "text-green-600" : "text-red-500"}`}>
            {uploadStatus.text}
          </p>
        )}

        {openFolderId ? (
          <>
            {filteredFolderFiles.length === 0 ? (
              <p className="text-ink-sub text-sm mt-8 text-center">まだファイルがありません</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredFolderFiles.map((f) => (
                  <FileTile key={f.id} file={f} onClick={() => openFile(f)} onRename={() => startRenameFile(f)} onDelete={() => handleDeleteFile(f)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {filteredFolders.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                {filteredFolders.map((folder) => (
                  <FolderTile
                    key={folder.id}
                    folder={folder}
                    count={libraryFiles.filter((f) => f.folderId === folder.id).length}
                    onClick={() => setOpenFolderId(folder.id)}
                    onRename={() => startRenameFolder(folder)}
                    onDelete={() => handleDeleteFolder(folder)}
                  />
                ))}
              </div>
            )}

            {filteredRootFiles.length === 0 && filteredFolders.length === 0 ? (
              <p className="text-ink-sub text-sm mt-8 text-center">まだファイルがありません</p>
            ) : (
              filteredRootFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  {filteredRootFiles.map((f, i) => (
                    <FileTile
                      key={f.id || i}
                      file={f}
                      onClick={() => openFile(f)}
                      onRename={f.id ? () => startRenameFile(f) : undefined}
                      onDelete={f.id ? () => handleDeleteFile(f) : undefined}
                    />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>

      {newFolderOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setNewFolderOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-app-surface rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">新規フォルダ</h2>
              <button onClick={() => setNewFolderOpen(false)} className="text-ink-sub"><X size={18} /></button>
            </div>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
              placeholder="フォルダ名"
              autoFocus
              className="w-full rounded-xl border border-app-line px-4 py-3 text-sm outline-none mb-4"
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="w-full h-12 rounded-full bg-ink text-app-bg text-sm font-semibold disabled:opacity-30"
            >
              作成
            </button>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/30" onClick={() => setRenameTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-app-surface rounded-t-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">名前を変更</h2>
              <button onClick={() => setRenameTarget(null)} className="text-ink-sub"><X size={18} /></button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
              autoFocus
              className="w-full rounded-xl border border-app-line px-4 py-3 text-sm outline-none mb-4"
            />
            <button
              onClick={commitRename}
              disabled={!renameValue.trim()}
              className="w-full h-12 rounded-full bg-ink text-app-bg text-sm font-semibold disabled:opacity-30"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
