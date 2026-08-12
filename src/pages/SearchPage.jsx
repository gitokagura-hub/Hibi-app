import { useState, useMemo, useRef } from "react";
import { FileText, Folder, Plus, ChevronLeft, X } from "lucide-react";
import { Layout } from "../components";
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

function FileTile({ file, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center text-center">
      <div className="w-full aspect-square rounded-xl bg-app-surface border border-app-line flex items-center justify-center mb-1.5">
        <FileText size={28} className="text-ink-sub" />
      </div>
      <div className="text-xs w-full truncate">{file.name}</div>
      <div className="text-[10px] text-ink-sub">{formatDate(file.createdAt)}{file.dataUrl ? ` ・ ${formatBytes(file.dataUrl)}` : ""}</div>
    </button>
  );
}

function FolderTile({ folder, count, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center text-center">
      <div className="w-full aspect-square flex items-center justify-center mb-1.5">
        <Folder size={52} className="text-sky-400" fill="currentColor" fillOpacity={0.15} />
      </div>
      <div className="text-xs w-full truncate">{folder.name}</div>
      <div className="text-[10px] text-ink-sub">{count}項目</div>
    </button>
  );
}

export default function SearchPage({ setTab }) {
  const { data, addLibraryFiles, deleteLibraryFile, addLibraryFolder, deleteLibraryFolder } = useData();
  const [q, setQ] = useState("");
  const [openFolderId, setOpenFolderId] = useState(null); // null=ルート
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
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
    const withData = await Promise.all(files.map((f) => fileToDataUrl(f)));
    addLibraryFiles(withData, openFolderId);
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    addLibraryFolder(name);
    setNewFolderName("");
    setNewFolderOpen(false);
  }

  function openFile(f) {
    if (!f.dataUrl) return; // 集約ファイルはdataUrlを持つ想定、無い場合は何もしない
    const a = document.createElement("a");
    a.href = f.dataUrl;
    a.download = f.name;
    a.click();
  }

  return (
    <Layout title={currentFolder ? currentFolder.name : "Files"} current="search" setTab={setTab}>
      <div className="px-5">
        {openFolderId && (
          <button onClick={() => setOpenFolderId(null)} className="flex items-center gap-1 text-sm text-ink-sub mb-3">
            <ChevronLeft size={16} /> Files
          </button>
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="検索"
            className="flex-1 rounded-xl bg-app-surface border border-app-line px-4 py-2.5 text-sm outline-none"
          />
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

        {openFolderId ? (
          <>
            {filteredFolderFiles.length === 0 ? (
              <p className="text-ink-sub text-sm mt-8 text-center">まだファイルがありません</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredFolderFiles.map((f) => (
                  <FileTile key={f.id} file={f} onClick={() => openFile(f)} />
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
                    <FileTile key={f.id || i} file={f} onClick={() => openFile(f)} />
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
    </Layout>
  );
}
