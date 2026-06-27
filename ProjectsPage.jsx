import { useState } from "react";
import { Layout } from "../components";
import { useData } from "../dataStore";

export default function ProjectsPage({ setTab }) {
  const { data, addProject } = useData();
  const [name, setName] = useState("");

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
          {data.projects.map((p) => (
            <div key={p.id} className="rounded-2xl border border-gray-200 p-5">
              <h2 className="text-lg font-medium">{p.name}</h2>
              <p className="text-sm text-gray-500 mt-2">Notes: {p.items.length}</p>
            </div>
          ))}
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
