import { useState, useMemo, useRef } from "react";
import { FileText, Folder, Plus, ChevronLeft, X, Search, MoreHorizontal } from "lucide-react";
import { Layout } from "../components";
import { useConfirm } from "../components/ConfirmModal";
import { useData, fileToDataUrl } from "../dataStore";
import { handleEnterToConfirm } from "../useEnterConfirm";
import { resolveMedia, isDriveRef } from "../media";

function formatBytes(dataUrl) {
  if (!dataUrl) return "";
  // "drive:ID" は参照だけでサイズ情報を持たない(実体はDrive上)。
  if (dataUrl.startsWith("drive:")) return "";
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
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// 建築図面の記号を思わせる、線だけで構成したフォルダ標(しるし)。
// iOS標準の塗りつぶし青フォルダの代わりに、細い線と一つの隅切りだけで
// 「フォルダである」ことを示す。
function FolderMark({ size = 22 }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 22 17" fill="none">
      <path
        d="M1 2.2C1 1.5 1.5 1 2.2 1H8L9.6 3.1H19.8C20.5 3.1 21 3.6 21 4.3V14.8C21 15.5 20.5 16 19.8 16H2.2C1.5 16 1 15.5 1 14.8V2.2Z"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function TileMenu({ onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 flex items-center justify-center text-files-ink/40"
        aria-label="メニュー"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-8 z-30 w-32 bg-files-paper border border-files-ink/15 cut-corner-sm">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
              className="w-full px-3.5 py-2.5 text-[12px] text-left font-sans tracking-wide text-files-ink"
            >
              名前を変更
            </button>
            <div className="h-px bg-files-line" />
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
              className="w-full px-3.5 py-2.5 text-[12px] text-left font-sans tracking-wide text-files-indigo"
            >
              削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// 資料庫の台帳のような1行。No.(通し番号)・標(フォルダ/ファイル種別)・
// 名称(明朝)・付帯情報(日付/サイズ、細字サンセリフ)を、罫線一本で区切る。
function ArchiveRow({ index, icon, title, meta, onClick, onRename, onDelete }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-files-line group">
      <span className="w-6 shrink-0 text-[11px] font-sans text-files-ink/35 tabular-nums text-right">
        {String(index + 1).padStart(2, "0")}
      </span>
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-4 text-left">
        <span className="shrink-0 text-files-indigo">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-mincho text-[15px] leading-snug text-files-ink truncate">{title}</span>
          <span className="block mt-0.5 text-[11px] font-sans tracking-wide text-files-ink/45">{meta}</span>
        </span>
      </button>
      {onRename && onDelete && <TileMenu onRename={onRename} onDelete={onDelete} />}
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
    // "drive:ID" の場合はDriveから実体を取得する。旧base64はそのまま変換する。
    let blob;
    if (isDriveRef(f.dataUrl)) {
      try {
        const url = await resolveMedia(f.dataUrl);
        blob = await (await fetch(url)).blob();
      } catch {
        alert("ファイルを取得できませんでした。");
        return;
      }
    } else {
      blob = dataUrlToBlob(f.dataUrl);
    }
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
      {openFolderId && (
        <button
          onClick={() => setOpenFolderId(null)}
          className="fixed top-14 right-3 z-30 w-10 h-10 flex items-center justify-center text-files-indigo"
          aria-label="戻る"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="bg-files-paper -mx-5 px-5 pb-24" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="pt-2 pb-6 border-b border-files-ink/15" />

        {/* 検索: 下線のみのミニマルな一行。虫眼鏡は小さく添える程度 */}
        <div className="flex items-center gap-3 py-4 border-b border-files-line">
          <Search size={14} className="text-files-ink/35 shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="検索"
            className="flex-1 bg-transparent text-[13px] font-sans tracking-wide text-files-ink placeholder:text-files-ink/35 outline-none"
          />
          <div className="relative shrink-0">
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              className="w-7 h-7 flex items-center justify-center text-files-indigo border border-files-ink/20 cut-corner-sm"
              aria-label="追加"
            >
              <Plus size={14} />
            </button>
            {addMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-30 w-44 bg-files-paper border border-files-ink/15 cut-corner">
                  <button
                    onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-sans tracking-wide text-left text-files-ink"
                  >
                    <FileText size={13} className="text-files-ink/50" /> ファイルを追加
                  </button>
                  {!openFolderId && (
                    <>
                      <div className="h-px bg-files-line" />
                      <button
                        onClick={() => { setAddMenuOpen(false); setNewFolderOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-sans tracking-wide text-left text-files-ink"
                      >
                        <FolderMark size={13} /> 新規フォルダ
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
          <p className={`text-[11px] font-sans tracking-wide mt-3 ${uploadStatus.type === "ok" ? "text-files-indigo" : "text-red-700"}`}>
            {uploadStatus.text}
          </p>
        )}

        {/* 一覧: 台帳形式。フォルダを先に、次いでファイルを通し番号で並べる */}
        {openFolderId ? (
          filteredFolderFiles.length === 0 ? (
            <p className="text-[12px] font-sans tracking-wide text-files-ink/40 mt-10 text-center">まだ何も収められていません</p>
          ) : (
            <div className="mt-1">
              {filteredFolderFiles.map((f, i) => (
                <ArchiveRow
                  key={f.id}
                  index={i}
                  icon={<FileText size={16} strokeWidth={1.4} />}
                  title={f.name}
                  meta={`${formatDate(f.createdAt)}${f.dataUrl ? `　${formatBytes(f.dataUrl)}` : ""}`}
                  onClick={() => openFile(f)}
                  onRename={() => startRenameFile(f)}
                  onDelete={() => handleDeleteFile(f)}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {filteredRootFiles.length === 0 && filteredFolders.length === 0 ? (
              <p className="text-[12px] font-sans tracking-wide text-files-ink/40 mt-10 text-center">まだ何も収められていません</p>
            ) : (
              <div className="mt-1">
                {filteredFolders.map((folder, i) => (
                  <ArchiveRow
                    key={folder.id}
                    index={i}
                    icon={<FolderMark size={17} />}
                    title={folder.name}
                    meta={`${libraryFiles.filter((f) => f.folderId === folder.id).length}項目`}
                    onClick={() => setOpenFolderId(folder.id)}
                    onRename={() => startRenameFolder(folder)}
                    onDelete={() => handleDeleteFolder(folder)}
                  />
                ))}
                {filteredRootFiles.map((f, i) => (
                  <ArchiveRow
                    key={f.id || `c${i}`}
                    index={filteredFolders.length + i}
                    icon={<FileText size={16} strokeWidth={1.4} />}
                    title={f.name}
                    meta={f.source ? f.source : `${formatDate(f.createdAt)}${f.dataUrl ? `　${formatBytes(f.dataUrl)}` : ""}`}
                    onClick={() => openFile(f)}
                    onRename={f.id ? () => startRenameFile(f) : undefined}
                    onDelete={f.id ? () => handleDeleteFile(f) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {newFolderOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-files-ink/30" onClick={() => setNewFolderOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-files-paper cut-corner p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mincho text-[17px] text-files-ink">新規フォルダ</h2>
              <button onClick={() => setNewFolderOpen(false)} className="text-files-ink/40"><X size={17} /></button>
            </div>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => handleEnterToConfirm(e, handleCreateFolder)}
              placeholder="フォルダ名"
              autoFocus
              className="w-full border-b border-files-line pb-2.5 text-[14px] font-sans text-files-ink outline-none mb-6 bg-transparent"
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="w-full h-11 bg-files-indigo text-files-paper text-[12px] font-sans tracking-widest cut-corner-sm disabled:opacity-25"
            >
              作成する
            </button>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-40 flex items-end bg-files-ink/30" onClick={() => setRenameTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-files-paper cut-corner p-7">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-mincho text-[17px] text-files-ink">名前を変更</h2>
              <button onClick={() => setRenameTarget(null)} className="text-files-ink/40"><X size={17} /></button>
            </div>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleEnterToConfirm(e, commitRename)}
              autoFocus
              className="w-full border-b border-files-line pb-2.5 text-[14px] font-sans text-files-ink outline-none mb-6 bg-transparent"
            />
            <button
              onClick={commitRename}
              disabled={!renameValue.trim()}
              className="w-full h-11 bg-files-indigo text-files-paper text-[12px] font-sans tracking-widest cut-corner-sm disabled:opacity-25"
            >
              保存する
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
