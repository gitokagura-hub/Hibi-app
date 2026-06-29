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
        className={`h-10 px-4 rounded-full border border-gray-200 flex items-center gap-2 ${selected === "Gemini" ? "bg-black text-white" : "bg-white"}`}
      >
        <Brain size={18} />
        Gemini
      </button>

      <button
        onClick={() => onSelect && onSelect("Claude")}
        className={`h-10 px-4 rounded-full border border-gray-200 flex items-center gap-2 ${selected === "Claude" ? "bg-black text-white" : "bg-white"}`}
      >
        <Sparkles size={18} />
        Claude
      </button>

      <button
        onClick={() => onSelect && onSelect("ChatGPT")}
        className={`h-10 px-4 rounded-full border border-gray-200 flex items-center gap-2 ${selected === "ChatGPT" ? "bg-black text-white" : "bg-white"}`}
      >
        <Bot size={18} />
        ChatGPT
      </button>

    </div>
  );
}
