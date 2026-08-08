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

// Classify pasted English-learning phrases into categories using the same
// AI provider/key setup as runAIOnNote. Categories are NOT a fixed list —
// the model is free to invent new category names, and is told about the
// categories that already exist so it reuses them instead of creating near-
// duplicates (e.g. "Business" vs "ビジネス").
export async function classifyPhrases({ provider, apiKey, rawText, existingCategories }) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!rawText || !rawText.trim()) throw new Error('NO_TEXT');

  const categoryHint = existingCategories?.length
    ? `既存のカテゴリー: ${existingCategories.join('、')}。内容が合えばこれらを再利用してください。合うものがなければ新しいカテゴリー名を自分で作ってください。`
    : '既存のカテゴリーはまだありません。内容に応じて適切なカテゴリー名を自分で作ってください。';

  const prompt = `以下は英語学習用に集めたフレーズです。1行が1フレーズで、"英語 | 日本語訳" の形式(訳が無い行もある)。各行をカテゴリー分けしてください。${categoryHint}\n\n出力は必ず次のJSON配列のみ(前置き・説明・コードブロック記号は一切不要):\n[{"en":"英語フレーズ","ja":"日本語訳","category":"カテゴリー名"}, ...]\n\n---フレーズ---\n${rawText.trim()}`;

  const raw = provider === 'gemini' ? await callGemini(apiKey, prompt)
    : provider === 'claude' ? await callClaude(apiKey, prompt)
    : (() => { throw new Error('UNSUPPORTED_PROVIDER'); })();

  const jsonText = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('CLASSIFY_PARSE_FAILED');
  }
  if (!Array.isArray(parsed)) throw new Error('CLASSIFY_PARSE_FAILED');

  return parsed
    .filter((it) => it && typeof it.en === 'string' && it.en.trim())
    .map((it) => ({
      en: it.en.trim(),
      ja: typeof it.ja === 'string' ? it.ja.trim() : '',
      category: typeof it.category === 'string' && it.category.trim() ? it.category.trim() : '未分類',
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
