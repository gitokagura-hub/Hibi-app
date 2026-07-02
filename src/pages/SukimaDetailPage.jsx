import { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useSukima, GROUPS, CARD_DEFS } from "../sukimaStore";

const STATUS_OPTIONS = [
  { id: "draft", label: "下書き" },
  { id: "investigating", label: "調査中" },
  { id: "done", label: "完了" },
];

function TagsEditor({ value, onChange }) {
  const [input, setInput] = useState("");
  function add() {
    if (!input.trim()) return;
    onChange([...(value || []), input.trim()]);
    setInput("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(value || []).map((t, i) => (
          <span
            key={i}
            className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full flex items-center gap-1"
          >
            {t}
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-emerald-400">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="タグを入力してEnter"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
        />
        <button onClick={add} className="text-xs font-semibold text-emerald-600 px-2">
          追加
        </button>
      </div>
    </div>
  );
}

function ChecklistEditor({ value, onChange }) {
  const [input, setInput] = useState("");
  const items = value || [];
  function add() {
    if (!input.trim()) return;
    onChange([...items, { text: input.trim(), done: false }]);
    setInput("");
  }
  function toggle(i) {
    onChange(items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)));
  }
  function remove(i) {
    onChange(items.filter((_, j) => j !== i));
  }
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2 mb-2">
          <button
            onClick={() => toggle(i)}
            className={`w-4 h-4 rounded mt-0.5 flex-shrink-0 flex items-center justify-center text-[9px] ${
              it.done ? "bg-emerald-600 text-white" : "border border-gray-300"
            }`}
          >
            {it.done ? "✓" : ""}
          </button>
          <span className={`flex-1 text-sm ${it.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
            {it.text}
          </span>
          <button onClick={() => remove(i)} className="text-gray-300 text-xs">
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-2 border border-dashed border-emerald-500 bg-emerald-50 rounded-lg px-3 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="次に調べることを自由に追加"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400"
        />
        <button onClick={add} className="text-xs font-semibold text-emerald-700">
          + 追加
        </button>
      </div>
    </div>
  );
}

function CardRow({ def, value, onChange }) {
  const [open, setOpen] = useState(false);

  let preview = "未記入";
  if (def.type === "tags") preview = value?.length ? `${value.length}件` : "未記入";
  else if (def.type === "checklist") preview = value?.length ? `${value.length}件` : "未記入";
  else if (value) preview = value.length > 14 ? value.slice(0, 14) + "…" : value;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 ${def.accent ? "pl-3" : ""}`}
        style={def.accent ? { borderLeft: "3px solid #279a63" } : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14.5px] font-medium text-gray-900">{def.title}</span>
          {def.accent && (
            <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              ★ 核心
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          <span className="text-xs max-w-[110px] truncate">{preview}</span>
          <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {def.type === "tags" && <TagsEditor value={value} onChange={onChange} />}
          {def.type === "checklist" && <ChecklistEditor value={value} onChange={onChange} />}
          {def.type === "text" && (
            <textarea
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="記入する..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-none"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function SukimaDetailPage({ entryId, onBack }) {
  const { getEntry, updateEntry, updateField, deleteEntry } = useSukima();
  const entry = getEntry(entryId);

  if (!entry) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-gray-400">この研究は見つかりませんでした</p>
        <button onClick={onBack} className="mt-4 text-emerald-600 text-sm font-semibold">
          一覧へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <button
        onClick={onBack}
        className="fixed bottom-6 left-5 z-30 w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="一覧へ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>

      <div className="bg-white sticky top-0 z-20 border-b border-gray-100">
        <div className="flex items-center justify-end px-4 pt-14 pb-2">
          <button
            onClick={() => {
              if (confirm(`「${entry.name}」を削除しますか？`)) {
                deleteEntry(entry.id);
                onBack();
              }
            }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <Trash2 size={16} className="text-red-400" />
          </button>
        </div>

        <div className="px-5 pb-4">
          <input
            value={entry.name}
            onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
            placeholder="名前"
            className="text-xl font-bold text-gray-900 w-full focus:outline-none"
          />
          <input
            value={entry.role}
            onChange={(e) => updateEntry(entry.id, { role: e.target.value })}
            placeholder="役職・所属など"
            className="text-sm text-gray-500 w-full mt-1 focus:outline-none"
          />
          <div className="flex gap-1.5 mt-3">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => updateEntry(entry.id, { status: s.id })}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  entry.status === s.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {GROUPS.map((g) => (
          <div key={g.code} className="mb-4">
            <div className="text-[11px] font-bold text-gray-400 tracking-wide mb-1.5 px-1">
              <span className="font-mono text-gray-300 mr-1">{g.code}</span>
              {g.title}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {CARD_DEFS.filter((c) => c.group === g.code).map((c) => (
                <CardRow
                  key={c.key}
                  def={c}
                  value={entry.fields[c.key]}
                  onChange={(v) => updateField(entry.id, c.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
