// Google Drive integration using Google Identity Services (GIS) token client.
// Uses the drive.file scope: the app can only see/manage files it creates itself.
// This is a "non-sensitive" scope, so it does not require Google app verification.

// ---- fill this in once you have your OAuth Client ID from Google Cloud Console ----
export const CLIENT_ID = '720962400807-7a9kq0ggvtmv803nlqoasm13cj16o2n3.apps.googleusercontent.com';
// -------------------------------------------------------------------------------------

const SCOPE = 'https://www.googleapis.com/auth/drive';
// Fixed root folder the person created by hand in their own Drive. Using a
// fixed ID instead of searching by name means uploads always land here,
// and it works even though the folder wasn't created by this app (which is
// why the scope above had to widen from drive.file to full drive access).
const ROOT_FOLDER_ID = '16e2sc1xBJgfCFBeYyvQXMvhtq0e05m77';
// Separate shared folder for Team-space projects, so Personal and Team
// files never mix. Whoever connects Drive needs at least "editor" access
// to this folder (shared to them by whoever created it).
const TEAM_ROOT_FOLDER_ID = '1tkFxzTYFKe1JyvBz0GDLI4fR1ddOEe3u';
const CONNECTED_FLAG = 'hibi-drive-connected';
const FOLDER_ID_KEY = 'hibi-drive-folder-id';
const TOKEN_KEY = 'hibi-drive-token';
const TOKEN_EXPIRY_KEY = 'hibi-drive-token-expiry';

let tokenClient = null;
// Restore from localStorage on load so a page reload / app relaunch doesn't
// lose the connection (the token still self-expires after ~1hr either way).
let accessToken = localStorage.getItem(TOKEN_KEY) || null;
let tokenExpiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY)) || 0;
const blobUrlCache = new Map();

function persistToken() {
  if (accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(tokenExpiry));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }
}

export function isDriveConfigured() {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.length > 0 && !CLIENT_ID.startsWith('YOUR_');
}

export function isDriveConnected() {
  return !!accessToken && Date.now() < tokenExpiry - 5000;
}

export function wasDriveConnectedBefore() {
  return localStorage.getItem(CONNECTED_FLAG) === '1';
}

function getClient() {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return null;
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // overridden per-call below
    });
  }
  return tokenClient;
}

// Must be called from inside a direct user gesture (click handler).
// IMPORTANT: this must stay synchronous up to requestAccessToken() — any
// `await` before it breaks the "direct user gesture" chain Safari/Chrome
// require, and the consent popup gets silently blocked instead of shown.
export function connectDrive() {
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) { reject(new Error('GOOGLE_SCRIPT_NOT_LOADED')); return; }
    client.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      localStorage.setItem(CONNECTED_FLAG, '1');
      persistToken();
      resolve(resp);
    };
    client.requestAccessToken({ prompt: 'consent' });
  });
}

export function disconnectDrive() {
  accessToken = null;
  tokenExpiry = 0;
  localStorage.removeItem(CONNECTED_FLAG);
  localStorage.removeItem(FOLDER_ID_KEY);
  persistToken();
  blobUrlCache.forEach(url => URL.revokeObjectURL(url));
  blobUrlCache.clear();
}

// トークンが切れていても、以前接続していれば「同意画面を出さずに」裏で再取得を試みる。
// Googleのセッションがまだ有効なら、ユーザーの操作なしで自動的に再接続できる。
// （prompt: '' が鍵。これがあると、既に許可済みのユーザーには何も表示せず即座にトークンが返る）
export function ensureDriveConnection() {
  return new Promise((resolve, reject) => {
    if (isDriveConnected()) { resolve(true); return; }
    if (!wasDriveConnectedBefore()) { reject(new Error('NOT_CONNECTED')); return; }
    const client = getClient();
    if (!client) { reject(new Error('GOOGLE_SCRIPT_NOT_LOADED')); return; }
    client.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      persistToken();
      resolve(true);
    };
    client.requestAccessToken({ prompt: '' });
  });
}

// Throws if not connected; UI should catch this and prompt a reconnect tap.
function requireToken() {
  if (!isDriveConnected()) throw new Error('NOT_CONNECTED');
  return accessToken;
}

async function getOrCreateFolder(rootFolderId) {
  return rootFolderId || ROOT_FOLDER_ID;
}

export async function getTeamRootFolderId() {
  return TEAM_ROOT_FOLDER_ID;
}

// アプリ名ごとのフォルダID（Sukima / Timeless Analogue / Daily Brains）をキャッシュ。
// これにより、メインのDriveフォルダ内が「Sukima」「Timeless Analogue」「Daily Brains」の
// 3つに整理され、各アプリのレコード用サブフォルダはその中に作られるようになる。
const APP_FOLDER_CACHE_PREFIX = 'hibi-drive-app-folder-';

export async function ensureAppFolder(appName) {
  const token = requireToken();
  const cacheKey = APP_FOLDER_CACHE_PREFIX + appName;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const check = await fetch(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (check.ok) {
      const checkData = await check.json();
      if (!checkData.trashed) return cached;
    }
  }

  const q = encodeURIComponent(
    `name='${appName}' and '${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    localStorage.setItem(cacheKey, searchData.files[0].id);
    return searchData.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: appName, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] }),
  });
  const createData = await createRes.json();
  localStorage.setItem(cacheKey, createData.id);
  return createData.id;
}

export async function uploadImage(file) {
  const token = requireToken();
  const folderId = await getOrCreateFolder();
  const metadata = { name: `${Date.now()}-${file.name}`, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('UPLOAD_FAILED');
  const data = await res.json();
  return data.id;
}

export async function getImageUrl(fileId) {
  if (blobUrlCache.has(fileId)) return blobUrlCache.get(fileId);
  const token = requireToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('FETCH_FAILED');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(fileId, url);
  return url;
}

const BACKUP_FILE_NAME = 'dayliybrains-backup.json';
const BACKUP_FILE_ID_KEY = 'hibi-drive-backup-file-id';

// Saves the full app data object as a single JSON file in the app's Drive folder.
// Overwrites the previous backup file if one already exists, so there's always
// just one "latest" backup rather than an ever-growing pile of files.
export async function backupDataToDrive(data) {
  const token = requireToken();
  const folderId = await getOrCreateFolder();
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });

  let fileId = localStorage.getItem(BACKUP_FILE_ID_KEY);
  if (fileId) {
    const check = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!check.ok) fileId = null;
    else {
      const checkData = await check.json();
      if (checkData.trashed) fileId = null;
    }
  }
  if (!fileId) {
    const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and '${folderId}' in parents and trashed=false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) fileId = searchData.files[0].id;
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(
    fileId ? { name: BACKUP_FILE_NAME } : { name: BACKUP_FILE_NAME, parents: [folderId] }
  )], { type: 'application/json' }));
  form.append('file', blob);

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`;
  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('BACKUP_FAILED');
  const resData = await res.json();
  localStorage.setItem(BACKUP_FILE_ID_KEY, resData.id);
  return resData.modifiedTime;
}

// Fetches the latest backup JSON from Drive and returns the parsed data object.
// Throws NO_BACKUP if no backup file exists yet.
export async function restoreDataFromDrive() {
  const token = requireToken();
  const folderId = await getOrCreateFolder();
  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and '${folderId}' in parents and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (!searchData.files || searchData.files.length === 0) throw new Error('NO_BACKUP');
  const fileId = searchData.files[0].id;
  localStorage.setItem(BACKUP_FILE_ID_KEY, fileId);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('RESTORE_FAILED');
  const data = await res.json();
  return { data, modifiedTime: searchData.files[0].modifiedTime };
}

// Finds or creates a per-project subfolder inside the app's main Drive folder.
// folderId is cached on the project object itself (driveFolderId) so repeated
// calls don't need to search every time — caller passes it in and stores
// whatever this returns back onto the project.
async function getOrCreateProjectFolder(projectId, projectName, cachedFolderId, rootFolderId) {
  const token = requireToken();
  if (cachedFolderId) {
    const check = await fetch(`https://www.googleapis.com/drive/v3/files/${cachedFolderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (check.ok) {
      const checkData = await check.json();
      if (!checkData.trashed) return cachedFolderId;
    }
  }
  const parentFolderId = await getOrCreateFolder(rootFolderId);
  const safeName = (projectName || 'プロジェクト').slice(0, 80);
  const q = encodeURIComponent(`name='${safeName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: safeName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }),
  });
  const createData = await createRes.json();
  return createData.id;
}

// Public wrapper: ensures a project has a Drive folder, returns its id.
// Pass the project's currently-known driveFolderId (or '' if none yet) so we
// reuse it instead of creating duplicates. Pass rootFolderId for Team
// projects (use getTeamRootFolderId()); omit it for Personal projects.
export async function ensureProjectFolder(projectId, projectName, cachedFolderId, rootFolderId) {
  return getOrCreateProjectFolder(projectId, projectName, cachedFolderId, rootFolderId);
}

// Uploads a single File into a project's Drive folder. Returns { fileId, name, mimeType, webViewLink }.
export async function uploadFileToProjectFolder(file, folderId) {
  const token = requireToken();
  const metadata = { name: file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('UPLOAD_FAILED');
  return res.json();
}

// Lists all non-folder files currently inside a project's Drive folder.
export async function listProjectFiles(folderId) {
  const token = requireToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,createdTime)&orderBy=createdTime desc`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('LIST_FAILED');
  const data = await res.json();
  return data.files || [];
}

export async function deleteProjectFile(fileId) {
  const token = requireToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (blobUrlCache.has(fileId)) {
    URL.revokeObjectURL(blobUrlCache.get(fileId));
    blobUrlCache.delete(fileId);
  }
}

export async function deleteImage(fileId) {
  const token = requireToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (blobUrlCache.has(fileId)) {
    URL.revokeObjectURL(blobUrlCache.get(fileId));
    blobUrlCache.delete(fileId);
  }
}
