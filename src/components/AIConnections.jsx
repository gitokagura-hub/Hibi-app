import {
  Bot,
  Sparkles,
  Brain,
} from "lucide-react";

export default function AIConnections({ selected, onSelect }) {
  return (
    <div className="flex items-center gap-3">

      <button
        onClick={() => onSelect && onSelect("Gemini")}
        className={`h-10 px-4 rounded-full border border-app-line flex items-center gap-2 ${selected === "Gemini" ? "bg-ink text-app-bg" : "bg-app-surface"}`}
      >
        <Brain size={18} />
        Gemini
      </button>

      <button
        onClick={() => onSelect && onSelect("Claude")}
        className={`h-10 px-4 rounded-full border border-app-line flex items-center gap-2 ${selected === "Claude" ? "bg-ink text-app-bg" : "bg-app-surface"}`}
      >
        <Sparkles size={18} />
        Claude
      </button>

      <button
        onClick={() => onSelect && onSelect("ChatGPT")}
        className={`h-10 px-4 rounded-full border border-app-line flex items-center gap-2 ${selected === "ChatGPT" ? "bg-ink text-app-bg" : "bg-app-surface"}`}
      >
        <Bot size={18} />
        ChatGPT
      </button>

    </div>
  );
}
