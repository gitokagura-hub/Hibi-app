// AI assist for Notes: sends a note's text plus a free-form instruction
// (e.g. "summarize this", "turn into tasks") to either Gemini or Claude,
// using the API key the person entered in Settings. Keys never leave the
// device except in the direct request to that provider's own API.

const GEMINI_MODEL = 'gemini-3.5-flash';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

export async function runAIOnNote({ provider, apiKey, noteText, instruction }) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!instruction || !instruction.trim()) throw new Error('NO_INSTRUCTION');

  const prompt = `以下はユーザーが書いたノートです。ユーザーの指示に従って処理してください。指示への返答のみを出力し、前置きや説明は不要です。\n\n---ノート---\n${noteText || '(空のノート)'}\n---\n\n指示: ${instruction.trim()}`;

  if (provider === 'gemini') return callGemini(apiKey, prompt);
  if (provider === 'claude') return callClaude(apiKey, prompt);
  throw new Error('UNSUPPORTED_PROVIDER');
}

// Takes a block of pasted text (one English phrase per line, optionally
// with a Japanese translation separated by | or ,) and asks the AI to sort
// each line into a short Japanese category name (e.g. 日常会話, ビジネス英語,
// 旅行, 買い物). Returns [{ en, ja, category }].
export async function classifyPhrases({ provider, apiKey, rawText }) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!rawText || !rawText.trim()) throw new Error('NO_TEXT');

  const prompt = `あなたは英語学習アプリの分類アシスタントです。以下は、ユーザーが英会話で使った・覚えたい英語フレーズの一覧です（1行に1フレーズ、英語と日本語訳が | またはカンマで区切られている場合があります）。

各行を読んで、短い日本語のカテゴリー名（例：日常会話、ビジネス英語、旅行、買い物、レストラン、雑談 など、内容に応じて自然なもの）を1つずつ付けてください。似た内容の行には同じカテゴリー名を使い、カテゴリーの種類は多くても6〜7個程度に抑えてください。

出力は必ず次のJSON形式の配列のみとし、前置きや説明、コードブロック記号は一切付けないでください：
[{"en":"英語フレーズ","ja":"日本語訳（なければ空文字）","category":"カテゴリー名"}, ...]

---フレーズ一覧---
${rawText.trim()}`;

  const raw = provider === 'gemini' ? await callGemini(apiKey, prompt)
    : provider === 'claude' ? await callClaude(apiKey, prompt)
    : (() => { throw new Error('UNSUPPORTED_PROVIDER'); })();

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('CLASSIFY_PARSE_FAILED');
  }
  if (!Array.isArray(parsed)) throw new Error('CLASSIFY_PARSE_FAILED');
  return parsed
    .filter((item) => item && typeof item.en === 'string' && item.en.trim())
    .map((item) => ({
      en: item.en.trim(),
      ja: (item.ja || '').trim(),
      category: (item.category || '未分類').trim() || '未分類',
    }));
}

async function callGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'GEMINI_REQUEST_FAILED');
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text) throw new Error('GEMINI_EMPTY_RESPONSE');
  return text.trim();
}

async function callClaude(apiKey, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'CLAUDE_REQUEST_FAILED');
  }
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('CLAUDE_EMPTY_RESPONSE');
  return text.trim();
}
