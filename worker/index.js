/**
 * Gito Workspace API Worker
 *
 * Daily Brains / Sukima / Timeless Analogue のデータを、
 * D1（クラウドの共有データベース）に保存・読み込みするための最小API。
 *
 * 各アプリのデータは丸ごと1つのJSONとしてapp_dataテーブルに保存する
 * （既存のlocalStorageの中身と同じ形をそのままクラウドに置き換えるイメージ）。
 *
 * ルート:
 *   GET  /api/data/:app   -> そのアプリの保存データ（JSON）を返す
 *   PUT  /api/data/:app   -> そのアプリのデータ（JSON）を保存する
 *
 * :app は "brains" | "sukima" | "timeless" のいずれか。
 *
 * 簡易保護として、Authorization: Bearer <API_TOKEN> ヘッダーを必須にしている。
 * トークンはwrangler.jsonc の vars.API_TOKEN と一致している必要がある。
 */

const ALLOWED_APPS = new Set(["brains", "sukima", "timeless"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function ensureSchema(db) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS app_data (
        app TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )
    .run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // /api/ 以外は静的ファイル（React SPA本体）をそのまま返す
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // 簡易トークンチェック（ヘッダー優先、無ければURLの ?token= も許可 — ブラウザで直接テストできるように）
    const auth = request.headers.get("Authorization") || "";
    const headerToken = auth.replace(/^Bearer\s+/i, "");
    const queryToken = url.searchParams.get("token") || "";
    const token = headerToken || queryToken;
    if (!env.API_TOKEN || token !== env.API_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }

    const match = url.pathname.match(/^\/api\/data\/([a-zA-Z]+)$/);
    if (!match) {
      return json({ error: "Not found" }, 404);
    }
    const app = match[1];
    if (!ALLOWED_APPS.has(app)) {
      return json({ error: "Unknown app" }, 400);
    }

    await ensureSchema(env.DB);

    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT json FROM app_data WHERE app = ?")
        .bind(app)
        .first();
      if (!row) {
        return json({ found: false, data: null });
      }
      return json({ found: true, data: JSON.parse(row.json) });
    }

    if (request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO app_data (app, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(app) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
      )
        .bind(app, JSON.stringify(body), now)
        .run();
      return json({ ok: true, updated_at: now });
    }

    return json({ error: "Method not allowed" }, 405);
  },
};
