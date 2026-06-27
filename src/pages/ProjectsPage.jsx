import { useState } from "react";
import { Layout } from "../components";
import { useData } from "../dataStore";

export default function ProjectsPage({ setTab }) {
  const { data, addProject } = useData();
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState(null);

  function handleAdd() {
    if (!name.trim()) return;
    addProject(name.trim());
    setName("");
  }

  return (
    <Layout title="Projects" current="projects" setTab={setTab}>
      <div className="px-5">
        <div className="space-y-4 mb-6">
          {data.projects.length === 0 && <p className="text-gray-400">No projects yet</p>}
          {data.projects.map((p) => {
            const isOpen = openId === p.id;
            return (
              <div key={p.id} className="rounded-2xl border border-gray-200 p-5">
                <button onClick={() => setOpenId(isOpen ? null : p.id)} className="w-full text-left">
                  <h2 className="text-lg font-medium">{p.name}</h2>
                  <p className="text-sm text-gray-500 mt-2">Notes: {p.items.length} {isOpen ? "▲" : "▼"}</p>
                </button>
                {isOpen && (
                  <div className="mt-4 space-y-3">
                    {p.items.length === 0 && <p className="text-sm text-gray-400">No notes pasted yet</p>}
                    {p.items.map((item) => (
                      <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                        {item.text && <p className="text-sm whitespace-pre-wrap">{item.text}</p>}
                        {item.images && item.images.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto mt-2">
                            {item.images.map((src, i) => (
                              <img key={i} src={src} alt="" className="w-16 h-16 object-cover rounded-lg border flex-shrink-0" />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="New project name..."
          className="w-full rounded-2xl border p-4 mb-2"
        />
        <button onClick={handleAdd} className="rounded-xl border px-4 py-2">
          Add
        </button>
      </div>
    </Layout>
  );
}
