/**
 * Gito Workspace API Worker
 *
 * Daily Brains / Sukima / Timeless Analogue のデータを、
 * D1（クラウドの共有データベース）に保存・読み込みするための最小API。
 *
 * Also handles task reminder push notifications for Daily Brains:
 * - POST /api/push/subscribe    — save a browser's Push subscription
 * - POST /api/push/unsubscribe  — remove a Push subscription
 * - PUT  /api/reminders         — sync the current list of {id, date, time, title} reminders
 * - POST /api/reminders/check   — (called by Cron) send push for any reminder whose time has just passed
 */

import { sendWebPush } from './webpush.js';

const ALLOWED_APPS = new Set(["brains", "sukima", "timeless"]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
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
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS task_reminders (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        notified INTEGER NOT NULL DEFAULT 0
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

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const auth = request.headers.get("Authorization") || "";
    const headerToken = auth.replace(/^Bearer\s+/i, "");
    const queryToken = url.searchParams.get("token") || "";
    const token = headerToken || queryToken;
    if (!env.API_TOKEN || token !== env.API_TOKEN) {
      return json({ error: "Unauthorized" }, 401);
    }

    await ensureSchema(env.DB);

    // ---- Push subscription management ----
    if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      const sub = body.subscription;
      if (!sub || !sub.endpoint) return json({ error: "Missing subscription" }, 400);
      await env.DB.prepare(
        `INSERT INTO push_subscriptions (endpoint, json, created_at) VALUES (?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET json = excluded.json`
      ).bind(sub.endpoint, JSON.stringify(sub), Date.now()).run();
      return json({ ok: true });
    }

    if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      if (!body.endpoint) return json({ error: "Missing endpoint" }, 400);
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
      return json({ ok: true });
    }

    // ---- Manually trigger a reminder check (also called by the Cron Trigger below) ----
    if (url.pathname === "/api/reminders/check" && request.method === "POST") {
      const result = await checkAndSendReminders(env);
      return json(result);
    }

    // ---- Existing generic app data storage (unchanged) ----
    const match = url.pathname.match(/^\/api\/data\/([a-zA-Z]+)$/);
    const appendMatch = url.pathname.match(/^\/api\/append\/([a-zA-Z]+)$/);

    if (appendMatch) {
      const app = appendMatch[1];
      const arrayKeyMap = { sukima: "entries", timeless: "articles" };
      const arrayKey = arrayKeyMap[app];
      if (!arrayKey) return json({ error: "Unknown app" }, 400);

      let item;
      if (request.method === "POST") {
        try {
          item = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
      } else {
        const payloadParam = url.searchParams.get("item");
        if (!payloadParam) return json({ error: "Missing item param" }, 400);
        try {
          item = JSON.parse(decodeURIComponent(atob(payloadParam)));
        } catch {
          return json({ error: "Invalid base64/JSON in item param" }, 400);
        }
      }

      const row = await env.DB.prepare("SELECT json FROM app_data WHERE app = ?").bind(app).first();
      const current = row ? JSON.parse(row.json) : { [arrayKey]: [] };
      if (!Array.isArray(current[arrayKey])) current[arrayKey] = [];
      current[arrayKey] = [item, ...current[arrayKey]];

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO app_data (app, json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(app) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`
      ).bind(app, JSON.stringify(current), now).run();

      return json({ ok: true, added: item.name || item.title || "(unnamed)" });
    }

    if (!match) {
      return json({ error: "Not found" }, 404);
    }
    const app = match[1];
    if (!ALLOWED_APPS.has(app)) {
      return json({ error: "Unknown app" }, 400);
    }

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

  // Cloudflare Cron Trigger entry point — configured in wrangler.jsonc to run every minute.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAndSendReminders(env));
  },
};

// Finds Personal tasks (from the existing 'brains' app_data blob, which the
// app already syncs on every change via cloudSync.js) whose reminderTime has
// just passed, sends a push to every subscribed device, and marks them
// notified in a small separate table so they don't fire twice.
async function checkAndSendReminders(env) {
  await ensureSchema(env.DB);

  const row = await env.DB.prepare("SELECT json FROM app_data WHERE app = 'brains'").first();
  if (!row) return { ok: true, sent: 0, reason: 'no brains data yet' };

  let brainsData;
  try {
    brainsData = JSON.parse(row.json);
  } catch {
    return { ok: true, sent: 0, reason: 'unparseable brains data' };
  }
  const tasks = Array.isArray(brainsData.tasks) ? brainsData.tasks : [];

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const nowDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const due = tasks.filter((t) => t.reminderTime && t.date === nowDate && t.reminderTime <= nowTime && !t.completed);
  if (due.length === 0) return { ok: true, sent: 0 };

  const alreadyNotified = await env.DB.prepare("SELECT id FROM task_reminders WHERE notified = 1").all();
  const notifiedIds = new Set((alreadyNotified.results || []).map((r) => r.id));
  const toSend = due.filter((t) => !notifiedIds.has(t.id));
  if (toSend.length === 0) return { ok: true, sent: 0 };

  const subs = await env.DB.prepare("SELECT json FROM push_subscriptions").all();
  const subscriptions = (subs.results || []).map((r) => JSON.parse(r.json));

  let sent = 0;
  for (const task of toSend) {
    for (const sub of subscriptions) {
      try {
        await sendWebPush(
          sub,
          { title: '🔔 リマインダー', body: task.title, tag: `task-${task.id}`, url: '/' },
          env.VAPID_PUBLIC_KEY,
          env.VAPID_PRIVATE_KEY,
          env.VAPID_SUBJECT || 'mailto:gito.kagura@gmail.com'
        );
        sent++;
      } catch (err) {
        // A single failed subscription (e.g. expired) shouldn't stop the others.
        console.error('push send failed', err.message);
      }
    }
    await env.DB.prepare(
      `INSERT INTO task_reminders (id, date, time, title, completed, notified) VALUES (?, ?, ?, ?, 0, 1)
       ON CONFLICT(id) DO UPDATE SET notified = 1`
    ).bind(task.id, task.date, task.reminderTime, task.title || '').run();
  }

  return { ok: true, sent, reminders: toSend.length };
}
