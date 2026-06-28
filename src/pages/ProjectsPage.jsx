import { useState, useRef } from "react";
import { Layout } from "../components";
import { useData, formatDateTime } from "../dataStore";

function FullScreenItemEditor({ item, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-5 pt-14 pb-3 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-500">← 戻る</button>
        <span className="font-semibold">編集</span>
        <div className="w-10" />
      </div>

      <textarea
        autoFocus
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 w-full px-5 py-4 text-[16px] outline-none resize-none"
      />

      <div className="px-5" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        {item.images && item.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto mb-2">
            {item.images.map((src, i) => (
              <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-xl border flex-shrink-0" />
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
        <button onClick={onClose} className="w-full rounded-xl bg-black text-white px-4 py-3 text-sm font-semibold">← 戻る</button>
      </div>
    </div>
  );
}

export default function ProjectsPage({ setTab }) {
  const { data, addProject, setProjectDriveFolder, updateProjectItem, deleteProject, deleteProjectItem } = useData();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // { projectId, itemId }
  const rowRefs = useRef({});

  function handleAdd() {
    if (!name.trim()) return;
    addProject(name.trim());
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
    }
  }

  function handleDeleteProject(e, p) {
    e.stopPropagation();
    if (window.confirm(`「${p.name}」を削除しますか？中の項目もすべて削除されます。`)) {
      deleteProject(p.id);
      if (openId === p.id) setOpenId(null);
    }
  }

  const editingItem = editing
    ? data.projects.find((p) => p.id === editing.projectId)?.items.find((it) => it.id === editing.itemId)
    : null;

  return (
    <Layout title="Projects" current="projects" setTab={setTab}>
      <div className="px-5">
        <div className="rounded-3xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="font-bold text-[15px]">項目名（プロジェクト名）</span>
            <span className="text-xs text-gray-500 font-semibold">作成日</span>
          </div>

          {data.projects.length === 0 && (
            <div className="p-5 text-gray-400 text-sm">プロジェクトはまだありません</div>
          )}

          {data.projects.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} ref={(el) => (rowRefs.current[p.id] = el)} className="border-b border-gray-200 last:border-b-0 scroll-mt-2">
                <button onClick={() => handleToggle(p)} className="w-full text-left px-4 py-5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{formatDateTime(p.createdAt).split(" ")[0]}</span>
                      <span onClick={(e) => handleDeleteProject(e, p)} className="text-gray-400 text-sm px-1">🗑</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-5">
                    <div className="bg-gray-100 rounded-2xl p-3.5">
                      <div className="text-xs font-bold text-gray-600 mb-2">📂 連携ルーム・統合レイヤー</div>

                      <div className="text-[13px] text-gray-800 mb-3 space-y-1">
                        <div>• [ノート連携] ノートから転送されたアイデアを{p.items.length}件格納</div>
                        <div>
                          • [Google Drive]{" "}
                          {p.driveFolder ? `「${p.driveFolder}」フォルダに連携中` : "未連携"}
                        </div>
                      </div>

                      <input
                        value={p.driveFolder}
                        onChange={(e) => setProjectDriveFolder(p.id, e.target.value)}
                        placeholder="連携するDriveフォルダ名を入力..."
                        className="w-full rounded-lg border p-2 text-xs mb-3 bg-white"
                      />

                      {p.items.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {p.items.map((item) => (
                            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-2.5">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={() => setEditing({ projectId: p.id, itemId: item.id })}
                                  className="flex-1 text-left text-[13px] whitespace-pre-wrap"
                                >
                                  {item.text || <span className="text-gray-400">（空のメモ）</span>}
                                </button>
                                <button onClick={() => deleteProjectItem(p.id, item.id)} className="text-gray-400 text-sm flex-shrink-0">🗑</button>
                              </div>
                              {item.images && item.images.length > 0 && (
                                <div className="flex gap-1.5 overflow-x-auto mt-1.5">
                                  {item.images.map((src, i) => (
                                    <img key={i} src={src} alt="" className="w-12 h-12 object-cover rounded-lg border flex-shrink-0" />
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
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">
                          🔄 転送ボタン
                        </button>
                        <button onClick={() => setTab("calendar")} className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white">
                          📅 カレンダー連携
                        </button>
                      </div>
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
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="New project name..."
            className="w-full rounded-2xl border p-4 mb-2"
          />
          <button onClick={handleAdd} className="rounded-xl border px-4 py-2">Add</button>
        </div>
      </div>

      {editing && editingItem && (
        <FullScreenItemEditor
          item={editingItem}
          onChange={(text) => updateProjectItem(editing.projectId, editing.itemId, text)}
          onClose={() => setEditing(null)}
        />
      )}
    </Layout>
  );
}
