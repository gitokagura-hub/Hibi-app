// AI assist for Notes: sends a note's text plus a free-form instruction
// (e.g. "summarize this", "turn into tasks") to either Gemini or Claude,
// using the API key the person entered in Settings. Keys never leave the
// device except in the direct request to that provider's own API.

const GEMINI_MODEL = 'gemini-2.5-flash';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

export async function runAIOnNote({ provider, apiKey, noteText, instruction }) {
  if (!apiKey) throw new Error('NO_API_KEY');
  if (!instruction || !instruction.trim()) throw new Error('NO_INSTRUCTION');

  const prompt = `以下はユーザーが書いたノートです。ユーザーの指示に従って処理してください。指示への返答のみを出力し、前置きや説明は不要です。\n\n---ノート---\n${noteText || '(空のノート)'}\n---\n\n指示: ${instruction.trim()}`;

  if (provider === 'gemini') return callGemini(apiKey, prompt);
  if (provider === 'claude') return callClaude(apiKey, prompt);
  throw new Error('UNSUPPORTED_PROVIDER');
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
