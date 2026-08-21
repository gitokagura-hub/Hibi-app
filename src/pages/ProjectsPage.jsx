import { useState, useRef } from "react";
import { Copy, Check, Trash2, Paperclip, Camera } from "lucide-react";
import { Layout } from "../components";
import { useData, formatDateTime } from "../dataStore";
import { handleEnterToConfirm } from "../useEnterConfirm";
import { isDriveConnected, ensureAppFolder, ensureProjectFolder, uploadFileToProjectFolder, listProjectFiles, deleteProjectFile, getTeamRootFolderId } from "../googleDrive";
import { useConfirm } from "../components/ConfirmModal";
import MediaImg from "../components/MediaImg";
import { useReorder } from "../useReorder";

function isImageFile(mimeType) {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}

function FullScreenItemEditor({ item, onChangeText, onChangeHeading, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const value = item.text || "";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-app-surface flex flex-col">
      <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-app-line">
        <button onClick={onClose} className="text-ink-sub">← 戻る</button>
        <span className="font-semibold">編集</span>
        {item.text ? (
          <button onClick={handleCopy} className="text-ink-sub p-1" aria-label="コピー">
            {copied ? <Check size={19} className="text-green-500" /> : <Copy size={19} />}
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <input
        type="text"
        value={item.heading || ""}
        onChange={(e) => onChangeHeading(e.target.value)}
        placeholder="見出し"
        className="w-full px-5 pt-4 pb-1 text-[20px] font-bold outline-none block bg-transparent placeholder:text-ink-sub/50 placeholder:font-normal"
      />
      <textarea
        value={item.text}
        onChange={(e) => onChangeText(e.target.value)}
        className="flex-1 w-full px-5 py-2 text-[16px] outline-none resize-none"
      />

      <div className="px-5" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        {item.images && item.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {item.images.map((src, i) => (
              <MediaImg key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border flex-shrink-0" />
            ))}
          </div>
        )}
        {item.files && item.files.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {item.files.map((f, i) => (
              <div key={i} className="text-xs rounded-lg border p-2 truncate">📄 {f.name}</div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-xl bg-ink text-app-bg px-4 py-3 text-sm font-semibold">← 戻る</button>
      </div>
    </div>
  );
}

// プロジェクトごとに並び替えの状態を持つ必要があるため、リストを別部品に分ける。
function ProjectItemList({ project, isTeam, copiedItemId, onCopy, onEdit, onDelete }) {
  const { reorderProjectItems } = useData();
  const [selectedId, setSelectedId] = useState(null);
  const items = project.items || [];
  const dnd = useReorder(items.length, (from, to) => reorderProjectItems(project.id, from, to));

  return (
    <div className="space-y-2 mb-3">
      {items.map((item, index) => (
        <ProjectItemCard
          key={item.id}
          item={item}
          projectId={project.id}
          isTeam={isTeam}
          copiedItemId={copiedItemId}
          onCopy={onCopy}
          onDelete={onDelete}
          dragProps={isTeam ? {} : dnd.itemProps(index)}
          dragging={!isTeam && dnd.isDragging(index)}
          selected={selectedId === item.id}
          onTap={() => {
            // 長押しで掴んだ直後のタップは無視する
            if (dnd.wasLongPress()) return;
            // 1タップで選択、2タップで開く
            if (selectedId === item.id) onEdit(item);
            else setSelectedId(item.id);
          }}
        />
      ))}
    </div>
  );
}

function ProjectItemCard({ item, projectId, isTeam, copiedItemId, onCopy, onEdit, onDelete, dragProps, dragging, selected, onTap }) {

  // 一覧は Notes と同じ「見出し(太字)＋本文1行(薄字)」の2段。
  // 見出しが未入力なら本文の1行目を見出し位置に出す。
  const lines = (item.text || "")
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hasHeading = Boolean((item.heading || "").trim());
  const headLine = hasHeading ? item.heading.trim() : lines[0] || "";
  const bodyLine = hasHeading ? lines[0] || "" : lines[1] || "";
  const clip = (v, max) => (v.length > max ? v.slice(0, max) + "…" : v);

  return (
    <div
      {...dragProps}
      className={`relative rounded-xl border border-app-line bg-app-surface p-2.5 pr-9 pb-8 transition-all ${
        dragging ? "opacity-60 scale-[0.98] shadow-lg" : ""
      } ${selected && !dragging ? "bg-app-raised" : ""}`}
    >
      <button onClick={() => onCopy(item)} className="absolute top-2 right-2 text-ink-sub p-1" aria-label="コピー">
        {copiedItemId === item.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
      </button>
      <button onClick={onTap} className="w-full text-left">
        {headLine || bodyLine ? (
          <div>
            {headLine && <p className="text-[14px] font-bold leading-snug">{clip(headLine, 40)}</p>}
            {bodyLine && <p className="text-[12px] text-ink-sub leading-snug mt-0.5">{clip(bodyLine, 50)}</p>}
          </div>
        ) : (
          <span className="text-[13px] text-ink-sub">（空のメモ）</span>
        )}
        {isTeam && <span className="block text-[10px] text-blue-500 mt-1">● {item.author || "名無し"}</span>}
      </button>
      <button onClick={() => onDelete(item)} className="absolute bottom-2 right-2 text-ink-sub p-1" aria-label="削除">
        <Trash2 size={14} />
      </button>
      {item.images && item.images.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto mt-1.5">
          {item.images.map((src, i) => (
            <MediaImg key={i} src={src} alt="" className="w-12 h-12 object-cover rounded-lg border flex-shrink-0" />
          ))}
        </div>
      )}
      {item.files && item.files.length > 0 && (
        <div className="space-y-1 mt-1.5">
          {item.files.map((f, i) => (
            <div key={i} className="text-[11px] truncate">📄 {f.name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage({ setTab }) {
  const {
    data, addProject, setProjectDriveFolderId, setProjectDriveFiles, addProjectDriveFile, removeProjectDriveFile,
    updateProjectItem, addProjectItem, setProjectItemPriority, deleteProject, deleteProjectItem,
    space, teamData, teamLoading, teamError,
    addTeamProjectAction, deleteTeamProjectAction, updateTeamProjectDriveAction, addTeamProjectItemAction, updateTeamProjectItemAction, deleteTeamProjectItemAction,
  } = useData();
  // Projects画面でも切り替えを廃止し、常にPersonalとして扱う(理由はNotesPageと同じ)。
  const isTeam = false;
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [copiedItemId, setCopiedItemId] = useState(null);
  const [editing, setEditing] = useState(null); // { projectId, itemId }
  const [newMemoText, setNewMemoText] = useState({}); // { [projectId]: text }
  const [newMemoHeading, setNewMemoHeading] = useState({}); // { [projectId]: heading }
  const [galleryUploading, setGalleryUploading] = useState({}); // { [projectId]: boolean }
  const [galleryError, setGalleryError] = useState({}); // { [projectId]: string }
  const [brokenThumbs, setBrokenThumbs] = useState({}); // { [fileId]: true } — Drive thumbnails that failed to load
  const rowRefs = useRef({});
  const photoInputRefs = useRef({});
  const fileInputRefs = useRef({});

  // Team projects/items come back as two flat lists from the sheet; stitch
  // them into the same { ...project, items: [...] } shape the UI expects.
  const projects = isTeam
    ? teamData.projects.map((p) => ({
        ...p,
        name: p.text,
        items: teamData.projectItems.filter((it) => it.projectId === p.id),
      }))
    : data.projects;

  // Loads (or reloads) the Drive file list for a project's gallery, creating
  // the project's Drive folder on first use if it doesn't exist yet.
  async function loadGallery(p) {
    if (!isDriveConnected()) return;
    setGalleryError((prev) => ({ ...prev, [p.id]: "" }));
    try {
      const rootFolderId = isTeam ? await getTeamRootFolderId() : await ensureAppFolder('Daily Brains');
      const folderId = await ensureProjectFolder(p.id, p.name, p.driveFolderId, rootFolderId);
      const files = await listProjectFiles(folderId);
      if (isTeam) await updateTeamProjectDriveAction(p, folderId, files);
      else {
        if (folderId !== p.driveFolderId) setProjectDriveFolderId(p.id, folderId);
        setProjectDriveFiles(p.id, files);
      }
    } catch (err) {
      setGalleryError((prev) => ({ ...prev, [p.id]: "Driveとの連携に失敗しました。Settingsで連携状況を確認してください。" }));
    }
  }

  async function handleGalleryUpload(p, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!isDriveConnected()) {
      setGalleryError((prev) => ({ ...prev, [p.id]: "先にSettingsでGoogle Driveと連携してください" }));
      return;
    }
    setGalleryUploading((prev) => ({ ...prev, [p.id]: true }));
    setGalleryError((prev) => ({ ...prev, [p.id]: "" }));
    try {
      const rootFolderId = isTeam ? await getTeamRootFolderId() : await ensureAppFolder('Daily Brains');
      const folderId = await ensureProjectFolder(p.id, p.name, p.driveFolderId, rootFolderId);
      const uploadedFiles = [];
      for (const file of files) {
        const uploaded = await uploadFileToProjectFolder(file, folderId);
        uploadedFiles.push(uploaded);
        if (!isTeam) addProjectDriveFile(p.id, uploaded);
      }
      if (isTeam) {
        const merged = [...uploadedFiles, ...(p.driveFiles || [])];
        await updateTeamProjectDriveAction(p, folderId, merged);
      } else if (folderId !== p.driveFolderId) {
        setProjectDriveFolderId(p.id, folderId);
      }
    } catch (err) {
      setGalleryError((prev) => ({ ...prev, [p.id]: "アップロードに失敗しました" }));
    } finally {
      setGalleryUploading((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  async function handleGalleryDelete(p, file) {
    if (!(await confirm(`「${file.name}」をDriveから削除しますか？`, { confirmLabel: "削除する", danger: true }))) return;
    try {
      await deleteProjectFile(file.id);
      if (isTeam) {
        const remaining = (p.driveFiles || []).filter((f) => f.id !== file.id);
        await updateTeamProjectDriveAction(p, p.driveFolderId, remaining);
      } else {
        removeProjectDriveFile(p.id, file.id);
      }
    } catch {
      setGalleryError((prev) => ({ ...prev, [p.id]: "削除に失敗しました" }));
    }
  }

  function handleAddMemo(projectId) {
    const text = (newMemoText[projectId] || "").trim();
    const heading = (newMemoHeading[projectId] || "").trim();
    if (!text && !heading) return;
    if (isTeam) addTeamProjectItemAction(projectId, text);
    else addProjectItem(projectId, text, heading);
    setNewMemoText((prev) => ({ ...prev, [projectId]: "" }));
    setNewMemoHeading((prev) => ({ ...prev, [projectId]: "" }));
  }

  async function handleCopyMemo(item) {
    const value = item.text || "";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedItemId(item.id);
    setTimeout(() => setCopiedItemId((cur) => (cur === item.id ? null : cur)), 1500);
  }

  function handleAdd() {
    if (!name.trim()) return;
    if (isTeam) addTeamProjectAction(name.trim());
    else addProject(name.trim());
    setName("");
  }

  function handleToggle(p) {
    const willOpen = openId !== p.id;
    setOpenId(willOpen ? p.id : null);
    if (willOpen) {
      // jump so this project's row sits at the top of the view, since opening
      // its room content can otherwise push it out of sight below the fold.
      requestAnimationFrame(() => {
        rowRefs.current[p.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      loadGallery(p);
    }
  }

  async function handleDeleteProject(e, p) {
    e.stopPropagation();
    if (await confirm(`「${p.name}」を削除しますか？中の項目もすべて削除されます。`, { confirmLabel: "削除する", danger: true })) {
      if (isTeam) deleteTeamProjectAction(p.id);
      else deleteProject(p.id);
      if (openId === p.id) setOpenId(null);
    }
  }

  const editingItem = editing
    ? projects.find((p) => p.id === editing.projectId)?.items.find((it) => it.id === editing.itemId)
    : null;

  return (
    <Layout title="Projects" current="projects" setTab={setTab} hideSpaceSwitcher>
      <div className="px-5">
        <div className="rounded-3xl border border-app-line overflow-hidden mb-6">
          <div className="px-4 py-3 bg-app-surface border-b border-app-line flex items-center justify-between">
            <span className="font-bold text-[15px]">Item</span>
            <span className="text-xs text-ink-sub font-semibold">Date</span>
          </div>

          {projects.length === 0 && (
            <div className="p-5 text-ink-sub text-sm">プロジェクトはまだありません</div>
          )}

          {isTeam && teamError && <div className="px-4 pt-2 text-xs text-red-500">{teamError}</div>}
          {isTeam && teamLoading && <div className="px-4 pt-2 text-xs text-ink-sub">同期中…</div>}

          {projects.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} ref={(el) => (rowRefs.current[p.id] = el)} className="border-b border-app-line last:border-b-0 scroll-mt-2">
                <button onClick={() => handleToggle(p)} className="w-full text-left px-4 py-5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-sub">{formatDateTime(p.createdAt).split(" ")[0]}</span>
                      <span onClick={(e) => handleDeleteProject(e, p)} className="text-ink-sub text-sm px-1">🗑</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-5">
                    <div className="bg-app-raised rounded-2xl p-3.5">
                      {isTeam && (
                        <div className="text-[13px] text-ink mb-3">
                          <div>• [作成者] {p.author || "名無し"}</div>
                        </div>
                      )}

                      {/* File & photo gallery — backed by a real Drive folder (Personal: personal folder, Team: shared folder) */}
                      <div className="mb-3">
                          <div className="flex items-center justify-end mb-2">
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => fileInputRefs.current[p.id]?.click()}
                                disabled={galleryUploading[p.id]}
                                className="w-8 h-8 rounded-full border bg-app-surface flex items-center justify-center"
                              >
                                {galleryUploading[p.id] ? "…" : <Paperclip size={14} />}
                              </button>
                              <button
                                onClick={() => photoInputRefs.current[p.id]?.click()}
                                disabled={galleryUploading[p.id]}
                                className="w-8 h-8 rounded-full border bg-app-surface flex items-center justify-center"
                              >
                                {galleryUploading[p.id] ? "…" : <Camera size={14} />}
                              </button>
                            </div>
                          </div>
                          <input
                            ref={(el) => (photoInputRefs.current[p.id] = el)}
                            type="file" accept="image/*" multiple className="hidden"
                            onChange={(e) => { handleGalleryUpload(p, e.target.files); e.target.value = ""; }}
                          />
                          <input
                            ref={(el) => (fileInputRefs.current[p.id] = el)}
                            type="file" multiple className="hidden"
                            onChange={(e) => { handleGalleryUpload(p, e.target.files); e.target.value = ""; }}
                          />

                          {galleryError[p.id] && <p className="text-[11px] text-red-500">{galleryError[p.id]}</p>}

                          {p.driveFiles && p.driveFiles.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5 mt-2">
                              {p.driveFiles.map((f) => (
                                <div key={f.id} className="relative rounded-lg border bg-app-surface overflow-hidden">
                                  {isImageFile(f.mimeType) && !brokenThumbs[f.id] ? (
                                    <a href={f.webViewLink} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={f.thumbnailLink || f.webViewLink}
                                        alt={f.name}
                                        className="w-full h-16 object-cover"
                                        onError={() => setBrokenThumbs((prev) => ({ ...prev, [f.id]: true }))}
                                      />
                                    </a>
                                  ) : (
                                    <a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-16 px-1 text-center">
                                      <span className="text-lg">{isImageFile(f.mimeType) ? "🖼️" : "📄"}</span>
                                      <span className="text-[9px] truncate w-full">{f.name}</span>
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleGalleryDelete(p, f)}
                                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center"
                                  >×</button>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>

                      <div className="mb-3">
                        <input
                          type="text"
                          value={newMemoHeading[p.id] || ""}
                          onChange={(e) => setNewMemoHeading((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="見出し"
                          className="w-full rounded-lg border p-2 text-xs font-bold bg-app-surface mb-1.5"
                        />
                        <textarea
                          value={newMemoText[p.id] || ""}
                          onChange={(e) => setNewMemoText((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          onKeyDown={(e) => handleEnterToConfirm(e, () => handleAddMemo(p.id), { allowShiftNewline: true })}
                          placeholder="テキスト"
                          className="w-full rounded-lg border p-2 text-xs bg-app-surface resize-none mb-1.5"
                          rows={2}
                        />
                        <button
                          onClick={() => handleAddMemo(p.id)}
                          className="w-full rounded-lg bg-ink text-app-bg text-xs font-semibold py-1.5"
                        >
                          Add
                        </button>
                      </div>

                      {p.items.length > 0 && (
                        <ProjectItemList
                          project={p}
                          isTeam={isTeam}
                          copiedItemId={copiedItemId}
                          onCopy={handleCopyMemo}
                          onEdit={(it) => setEditing({ projectId: p.id, itemId: it.id })}
                          onDelete={async (it) => {
                            if (await confirm("このメモを削除しますか？", { confirmLabel: "削除する", danger: true })) {
                              isTeam ? deleteTeamProjectItemAction(it.id) : deleteProjectItem(p.id, it.id);
                            }
                          }}
                        />
                      )}

                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pb-32">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => handleEnterToConfirm(e, handleAdd)}
            placeholder="New project name..."
            className="w-full rounded-2xl border p-4 mb-2"
          />
          <button onClick={handleAdd} className="rounded-xl border px-4 py-2">Add</button>
        </div>
      </div>

      {editing && editingItem && (
        <FullScreenItemEditor
          item={editingItem}
          onChangeText={(text) => (isTeam ? updateTeamProjectItemAction(editing.itemId, text, editing.projectId) : updateProjectItem(editing.projectId, editing.itemId, text, editingItem.heading))}
          onChangeHeading={(heading) => (isTeam ? updateTeamProjectItemAction(editing.itemId, editingItem.text, editing.projectId) : updateProjectItem(editing.projectId, editing.itemId, editingItem.text, heading))}
          onClose={() => setEditing(null)}
        />
      )}
    </Layout>
  );
}
