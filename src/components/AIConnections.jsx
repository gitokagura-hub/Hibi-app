/**
 * AIの切り替え。
 *
 * アイコンは各社のロゴの形に寄せて自前で描いている(外部から画像を取得できないため)。
 * 選択中は塗り、未選択は輪郭という扱いにして、切り替え状態が一目で分かるようにする。
 */

// Geminiの四芒星
function GeminiMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0z" />
    </svg>
  );
}

// Claudeの放射状のマーク
function ClaudeMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <g transform="translate(12,12)">
        {Array.from({ length: 11 }).map((_, i) => (
          <rect
            key={i}
            x="-0.85"
            y="-11"
            width="1.7"
            height="10"
            rx="0.85"
            transform={`rotate(${(360 / 11) * i})`}
          />
        ))}
      </g>
    </svg>
  );
}

// ChatGPTの結び目状のマーク
function ChatGptMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3.6a3.3 3.3 0 0 1 5.72 2.24" strokeLinecap="round" />
      <path d="M17.72 5.84a3.3 3.3 0 0 1 2.05 5.64" strokeLinecap="round" />
      <path d="M19.77 11.48a3.3 3.3 0 0 1-2.05 5.64" strokeLinecap="round" />
      <path d="M17.72 17.12A3.3 3.3 0 0 1 12 19.36" strokeLinecap="round" />
      <path d="M12 19.36a3.3 3.3 0 0 1-5.72-2.24" strokeLinecap="round" />
      <path d="M6.28 17.12a3.3 3.3 0 0 1-2.05-5.64" strokeLinecap="round" />
      <path d="M4.23 11.48a3.3 3.3 0 0 1 2.05-5.64" strokeLinecap="round" />
      <path d="M6.28 5.84A3.3 3.3 0 0 1 12 3.6" strokeLinecap="round" />
      <path d="M12 8.2 15.4 10v4L12 15.8 8.6 14v-4z" />
    </svg>
  );
}

const ITEMS = [
  { id: "Gemini", Mark: GeminiMark },
  { id: "Claude", Mark: ClaudeMark },
  { id: "ChatGPT", Mark: ChatGptMark },
];

export default function AIConnections({ selected, onSelect }) {
  return (
    <div className="flex items-center gap-2">
      {ITEMS.map(({ id, Mark }) => (
        <button
          key={id}
          onClick={() => onSelect && onSelect(id)}
          className={`h-8 px-3 rounded-full border border-app-line flex items-center gap-1.5 text-[13px] ${
            selected === id ? "bg-ink text-app-bg" : "bg-app-surface text-ink"
          }`}
        >
          <Mark size={14} />
          {id}
        </button>
      ))}
    </div>
  );
}
