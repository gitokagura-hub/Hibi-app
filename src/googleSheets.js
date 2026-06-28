// Google Sheets integration for the "Team" space.
// Uses its own OAuth token client with the spreadsheets scope, separate from
// the Drive (drive.file) token used for personal image backup. This is
// because the user's existing Team sheet was created manually (not by this
// app), so the narrow drive.file scope cannot see it — we need the broader
// spreadsheets scope instead.

import { CLIENT_ID } from './googleDrive';

// ---- fill this in with the Sheet ID from the Team spreadsheet's URL ----
// e.g. for https://docs.google.com/spreadsheets/d/XXXX/edit, XXXX is the ID.
export const TEAM_SHEET_ID = '10MztdmVKKYD0C0XCpt8s-SufFASbELhWNKOKOGmn5fI';
// --------------------------------------------------------------------------

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CONNECTED_FLAG = 'hibi-sheets-connected';
const AUTHOR_NAME_KEY = 'hibi-team-author-name';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

export function isTeamConfigured() {
  return typeof TEAM_SHEET_ID === 'string' && TEAM_SHEET_ID.length > 0 && !TEAM_SHEET_ID.startsWith('YOUR_');
}

export function isTeamConnected() {
  return !!accessToken && Date.now() < tokenExpiry - 5000;
}

export function wasTeamConnectedBefore() {
  return localStorage.getItem(CONNECTED_FLAG) === '1';
}

export function getAuthorName() {
  return localStorage.getItem(AUTHOR_NAME_KEY) || '';
}

export function setAuthorName(name) {
  localStorage.setItem(AUTHOR_NAME_KEY, name);
}

function getClient() {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return null;
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SHEETS_SCOPE,
      callback: () => {},
    });
  }
  return tokenClient;
}

function waitForGoogleScript(timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('GOOGLE_SCRIPT_NOT_LOADED'));
      }
    }, 150);
  });
}

// Must be called from inside a direct user gesture (click handler) the first time.
export async function connectTeam() {
  await waitForGoogleScript();
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) { reject(new Error('GOOGLE_SCRIPT_NOT_LOADED')); return; }
    client.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      localStorage.setItem(CONNECTED_FLAG, '1');
      resolve(resp);
    };
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export function disconnectTeam() {
  accessToken = null;
  tokenExpiry = 0;
  localStorage.removeItem(CONNECTED_FLAG);
}

function requireToken() {
  if (!isTeamConnected()) throw new Error('NOT_CONNECTED');
  return accessToken;
}

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Tabs (named ranges) inside the Team spreadsheet, one per data kind.
// Columns: id | text | author | createdAt | extra (JSON string for images/files/etc)
const TAB_NOTES = 'TeamNotes';
const TAB_TASKS = 'TeamTasks';
const TAB_EVENTS = 'TeamEvents';
const TAB_PROJECTS = 'TeamProjects';
const TAB_PROJECT_ITEMS = 'TeamProjectItems';
const ALL_TABS = [TAB_NOTES, TAB_TASKS, TAB_EVENTS, TAB_PROJECTS, TAB_PROJECT_ITEMS];
const HEADER_ROW = ['id', 'text', 'author', 'createdAt', 'extra'];

// Creates any missing tabs with header rows. Safe to call repeatedly.
export async function ensureTeamSheetReady() {
  const token = requireToken();
  const metaRes = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) throw new Error('SHEET_NOT_FOUND');
  const meta = await metaRes.json();
  const existingTitles = (meta.sheets || []).map(s => s.properties.title);
  const missing = ALL_TABS.filter(t => !existingTitles.includes(t));

  if (missing.length > 0) {
    await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: missing.map(title => ({ addSheet: { properties: { title } } })),
      }),
    });
  }
  // Make sure every tab (old and new) has a header row.
  await Promise.all(ALL_TABS.map(async (tab) => {
    const checkRes = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A1:E1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const checkData = await checkRes.json();
    if (!checkData.values || checkData.values.length === 0) {
      await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A1:E1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [HEADER_ROW] }),
      });
    }
  }));
}

function rowsToObjects(rows) {
  if (!rows || rows.length <= 1) return [];
  return rows.slice(1).map(r => {
    let extra = {};
    try { extra = r[4] ? JSON.parse(r[4]) : {}; } catch {}
    return {
      id: r[0] || '',
      text: r[1] || '',
      author: r[2] || '',
      createdAt: Number(r[3]) || Date.now(),
      ...extra,
      rowIndex: null, // filled in by caller if needed
    };
  });
}

async function fetchTab(tab) {
  const token = requireToken();
  const res = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A:E`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('FETCH_FAILED');
  const data = await res.json();
  return rowsToObjects(data.values);
}

async function appendRow(tab, obj, extraFields) {
  const token = requireToken();
  const extra = extraFields ? JSON.stringify(extraFields) : '';
  const row = [obj.id, obj.text || '', obj.author || '', String(obj.createdAt || Date.now()), extra];
  const res = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A:E:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error('APPEND_FAILED');
}

// Finds the 1-indexed sheet row number for a given id by re-reading column A.
async function findRowNumber(tab, id) {
  const token = requireToken();
  const res = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A:A`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const col = data.values || [];
  const idx = col.findIndex(r => r[0] === id);
  return idx === -1 ? null : idx + 1; // 1-indexed, includes header offset naturally
}

async function updateRow(tab, id, obj, extraFields) {
  const token = requireToken();
  const rowNum = await findRowNumber(tab, id);
  if (!rowNum) throw new Error('ROW_NOT_FOUND');
  const extra = extraFields ? JSON.stringify(extraFields) : '';
  const row = [obj.id, obj.text || '', obj.author || '', String(obj.createdAt || Date.now()), extra];
  const res = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}/values/${tab}!A${rowNum}:E${rowNum}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error('UPDATE_FAILED');
}

async function deleteRow(tab, id) {
  const token = requireToken();
  const rowNum = await findRowNumber(tab, id);
  if (!rowNum) return;
  const metaRes = await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  const sheetProps = (meta.sheets || []).find(s => s.properties.title === tab)?.properties;
  if (!sheetProps) return;
  await fetch(`${SHEETS_BASE}/${TEAM_SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId: sheetProps.sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
        },
      }],
    }),
  });
}

// ---- Public API, one set of functions per data kind ----

export const fetchTeamNotes = () => fetchTab(TAB_NOTES);
export const addTeamNote = (id, text, author) => appendRow(TAB_NOTES, { id, text, author, createdAt: Date.now() });
export const updateTeamNote = (id, text, author) => updateRow(TAB_NOTES, id, { id, text, author, createdAt: Date.now() });
export const deleteTeamNote = (id) => deleteRow(TAB_NOTES, id);

export const fetchTeamTasks = () => fetchTab(TAB_TASKS);
export const addTeamTask = (id, text, author, date) => appendRow(TAB_TASKS, { id, text, author, createdAt: Date.now() }, { date, completed: false });
export const updateTeamTask = (id, text, author, extra) => updateRow(TAB_TASKS, id, { id, text, author, createdAt: Date.now() }, extra);
export const deleteTeamTask = (id) => deleteRow(TAB_TASKS, id);

export const fetchTeamEvents = () => fetchTab(TAB_EVENTS);
export const addTeamEvent = (id, title, author, date, time) => appendRow(TAB_EVENTS, { id, text: title, author, createdAt: Date.now() }, { date, time });
export const deleteTeamEvent = (id) => deleteRow(TAB_EVENTS, id);

export const fetchTeamProjects = () => fetchTab(TAB_PROJECTS);
export const addTeamProject = (id, name, author) => appendRow(TAB_PROJECTS, { id, text: name, author, createdAt: Date.now() }, { driveFolder: '' });
export const deleteTeamProject = (id) => deleteRow(TAB_PROJECTS, id);

export const fetchTeamProjectItems = () => fetchTab(TAB_PROJECT_ITEMS);
export const addTeamProjectItem = (id, text, author, projectId) => appendRow(TAB_PROJECT_ITEMS, { id, text, author, createdAt: Date.now() }, { projectId });
export const updateTeamProjectItem = (id, text, author, projectId) => updateRow(TAB_PROJECT_ITEMS, id, { id, text, author, createdAt: Date.now() }, { projectId });
export const deleteTeamProjectItem = (id) => deleteRow(TAB_PROJECT_ITEMS, id);
