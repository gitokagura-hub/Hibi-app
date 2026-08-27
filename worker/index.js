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

// ledger: 酒類台帳。他と同じapp_dataテーブルにキー"ledger"で保存する。
const ALLOWED_APPS = new Set(["brains", "sukima", "timeless", "ledger"]);

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
    // charset=utf-8 を明示する。これが無いとSafariが別の文字コードとして解釈し、
    // 日本語が文字化けして見える(データ自体は壊れていないが、内容の確認が困難になる)。
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
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
      const assetResponse = await env.ASSETS.fetch(request);
      // Zombie service-worker kill switch (2026-08-05 incident):
      // not_found_handling=single-page-application means any unknown path —
      // including a service worker URL from an old build (e.g.
      // /service-worker.js, /registerSW.js) — returns index.html with 200.
      // The browser then treats the SW update as a parse failure and keeps
      // the old (broken) service worker alive forever, so no deploy ever
      // reaches the device. Instead, answer any unknown *.js path with a
      // valid self-destructing service worker: when the zombie re-checks its
      // script URL it installs this, which unregisters itself, wipes caches,
      // and reloads every open page — recovering white-screened devices with
      // zero user action. Harmless for non-SW js requests (they were getting
      // useless HTML before anyway).
      if (
        url.pathname.endsWith(".js") &&
        (assetResponse.headers.get("Content-Type") || "").includes("text/html")
      ) {
        const jsHeaders = {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Service-Worker-Allowed": "/",
        };
        // 旧ビルド由来のservice worker URLにのみ自爆SWを返す。
        const isLegacySwPath = /^\/(service-worker|registerSW|workbox|sw)[\w.-]*\.js$/.test(url.pathname);
        if (isLegacySwPath) {
          const killSw = `self.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',e=>{e.waitUntil((async()=>{try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}catch(_){}try{await self.registration.unregister();}catch(_){}try{const cs=await self.clients.matchAll({type:'window'});cs.forEach(c=>c.navigate(c.url).catch(()=>{}));}catch(_){}})());});\n`;
          return new Response(killSw, { status: 200, headers: jsHeaders });
        }
        // それ以外の未知の.js = 古いindex.htmlが既に存在しない旧ハッシュの
        // バンドルを要求しているケース(デプロイでハッシュが変わった直後など)。
        // 2026-08-07の再発白画面の原因: ここで自爆SWを返すと「エラーなし・
        // 描画なし」の静かな白画面になる。代わりに1回だけキャッシュバスター
        // 付きで再読み込みする自己修復JSを返し、最新のindex.htmlを取り直させる。
        const selfHeal = `try{if(!sessionStorage.getItem('__stale_heal')){sessionStorage.setItem('__stale_heal','1');location.replace('/?fresh='+Date.now());}else{document.body.innerHTML='<div style="padding:24px;font:14px -apple-system"><b>更新の取得に失敗しました</b><br>タブを閉じて開き直してください。</div>';}}catch(_){}`;
        return new Response(selfHeal, { status: 200, headers: jsHeaders });
      }
      // sw.js and index.html must never be cached by the browser/CDN — if
      // they are, the browser has no way to notice a new deploy exists, so
      // it keeps running whatever service worker (and bundle) it already
      // has forever, even after every subsequent deploy succeeds. This is
      // what caused deploys to stop reaching phones despite Cloudflare
      // reporting each build as successful.
      if (url.pathname === "/sw.js" || url.pathname === "/" || url.pathname === "/index.html") {
        const headers = new Headers(assetResponse.headers);
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
        return new Response(assetResponse.body, { status: assetResponse.status, headers });
      }
      return assetResponse;
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

    // ---- View the log of the last automatic Cron Trigger runs ----
    if (url.pathname === "/api/reminders/log" && request.method === "GET") {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS cron_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at INTEGER NOT NULL, result TEXT NOT NULL)`
      ).run();
      const rows = await env.DB.prepare("SELECT ran_at, result FROM cron_log ORDER BY ran_at DESC LIMIT 20").all();
      return json({
        ok: true,
        entries: (rows.results || []).map((r) => ({ ranAt: new Date(r.ran_at).toISOString(), result: JSON.parse(r.result) })),
      });
    }

    // ---- Manually trigger a reminder check (also called by the Cron Trigger below) ----
    // GET is allowed (in addition to POST) so this can be opened directly in a
    // browser with ?token=... for quick manual debugging. Add &debug=1 to
    // bypass the time-window filter and see exactly what would be sent.
    if (url.pathname === "/api/reminders/check" && (request.method === "POST" || request.method === "GET")) {
      const debug = url.searchParams.get("debug") === "1";
      const result = await checkAndSendReminders(env, debug);
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
    ctx.waitUntil(runScheduledCheck(env));
  },
};

// Wraps checkAndSendReminders with logging to D1, since a Cron Trigger's
// return value isn't otherwise visible anywhere — this is the only way to
// see what actually happened on each automatic run (as opposed to a manual
// debug request, which we can already see the response of).
async function runScheduledCheck(env) {
  await ensureSchema(env.DB);
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS cron_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at INTEGER NOT NULL, result TEXT NOT NULL)`
  ).run();
  let result;
  try {
    result = await checkAndSendReminders(env);
  } catch (err) {
    result = { ok: false, error: err.message, stack: err.stack };
  }
  await env.DB.prepare(`INSERT INTO cron_log (ran_at, result) VALUES (?, ?)`).bind(Date.now(), JSON.stringify(result)).run();
  // Keep only the most recent 50 log rows.
  await env.DB.prepare(
    `DELETE FROM cron_log WHERE id NOT IN (SELECT id FROM cron_log ORDER BY ran_at DESC LIMIT 50)`
  ).run();
  return result;
}

// Finds Personal tasks (from the existing 'brains' app_data blob, which the
// app already syncs on every change via cloudSync.js) whose reminderTime has
// just passed, sends a push to every subscribed device, and marks them
// notified in a small separate table so they don't fire twice.
async function checkAndSendReminders(env, debug = false) {
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
  const tasksWithReminder = tasks.filter((t) => t.reminderTime);

  // Cloudflare Workers run in UTC — the app's dates/times (and what the
  // person types into the reminder time field) are always JST, so convert
  // explicitly here rather than using the server's local getHours()/etc.
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const now = new Date(Date.now() + JST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  const nowDate = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const nowTime = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;

  const subs = await env.DB.prepare("SELECT json FROM push_subscriptions").all();
  const subscriptions = (subs.results || []).map((r) => JSON.parse(r.json));

  const due = tasks.filter((t) => t.reminderTime && t.date === nowDate && t.reminderTime <= nowTime && !t.completed);

  if (debug) {
    // Bypass the time/notified filters entirely and try sending to whatever
    // has a reminderTime today, reporting exactly what happens per subscription.
    const attempts = [];
    for (const task of tasksWithReminder) {
      for (const sub of subscriptions) {
        try {
          const res = await sendWebPush(
            sub,
            { title: '🔔 リマインダー（テスト）', body: task.title, tag: `debug-${task.id}`, url: '/' },
            env.VAPID_PUBLIC_KEY,
            env.VAPID_PRIVATE_KEY,
            env.VAPID_SUBJECT || 'mailto:gito.kagura@gmail.com'
          );
          attempts.push({ task: task.title, status: res.status, statusText: res.statusText, body: await res.text().catch(() => '') });
        } catch (err) {
          attempts.push({ task: task.title, error: err.message, stack: err.stack });
        }
      }
    }
    return {
      ok: true,
      debug: true,
      nowDate,
      nowTime,
      tasksWithReminder: tasksWithReminder.map((t) => ({ id: t.id, date: t.date, time: t.reminderTime, title: t.title, completed: t.completed })),
      subscriptionCount: subscriptions.length,
      dueCount: due.length,
      attempts,
    };
  }

  if (due.length === 0) return { ok: true, sent: 0, nowDate, nowTime, tasksWithReminder: tasksWithReminder.length, subscriptionCount: subscriptions.length };

  const alreadyNotified = await env.DB.prepare("SELECT id FROM task_reminders WHERE notified = 1").all();
  const notifiedIds = new Set((alreadyNotified.results || []).map((r) => r.id));
  const toSend = due.filter((t) => !notifiedIds.has(t.id));
  if (toSend.length === 0) return { ok: true, sent: 0, reason: 'already notified', dueCount: due.length };

  let sent = 0;
  const errors = [];
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
        errors.push(err.message);
        console.error('push send failed', err.message);
      }
    }
    await env.DB.prepare(
      `INSERT INTO task_reminders (id, date, time, title, completed, notified) VALUES (?, ?, ?, ?, 0, 1)
       ON CONFLICT(id) DO UPDATE SET notified = 1`
    ).bind(task.id, task.date, task.reminderTime, task.title || '').run();
  }

  return { ok: true, sent, reminders: toSend.length, errors };
}
