// Google Drive integration using Google Identity Services (GIS) token client.
// Uses the drive.file scope: the app can only see/manage files it creates itself.
// This is a "non-sensitive" scope, so it does not require Google app verification.

// ---- fill this in once you have your OAuth Client ID from Google Cloud Console ----
export const CLIENT_ID = '720962400807-7a9kq0ggvtmv803nlqoasm13cj16o2n3.apps.googleusercontent.com';
// -------------------------------------------------------------------------------------

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const APP_FOLDER_NAME = 'Hibiアプリの画像';
const CONNECTED_FLAG = 'hibi-drive-connected';
const FOLDER_ID_KEY = 'hibi-drive-folder-id';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
const blobUrlCache = new Map();

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

// Waits briefly for the Google Identity Services script to finish loading,
// since it's loaded with async/defer and may not be ready the instant the
// person taps "connect" right after opening the app.
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
export async function connectDrive() {
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

export function disconnectDrive() {
  accessToken = null;
  tokenExpiry = 0;
  localStorage.removeItem(CONNECTED_FLAG);
  localStorage.removeItem(FOLDER_ID_KEY);
  blobUrlCache.forEach(url => URL.revokeObjectURL(url));
  blobUrlCache.clear();
}

// Throws if not connected; UI should catch this and prompt a reconnect tap.
function requireToken() {
  if (!isDriveConnected()) throw new Error('NOT_CONNECTED');
  return accessToken;
}

async function getOrCreateFolder() {
  const token = requireToken();
  let folderId = localStorage.getItem(FOLDER_ID_KEY);
  if (folderId) {
    const check = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (check.ok) {
      const data = await check.json();
      if (!data.trashed) return folderId;
    }
  }
  const q = encodeURIComponent(`name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
    localStorage.setItem(FOLDER_ID_KEY, folderId);
    return folderId;
  }
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const createData = await createRes.json();
  folderId = createData.id;
  localStorage.setItem(FOLDER_ID_KEY, folderId);
  return folderId;
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
async function getOrCreateProjectFolder(projectId, projectName, cachedFolderId) {
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
  const parentFolderId = await getOrCreateFolder();
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
// reuse it instead of creating duplicates.
export async function ensureProjectFolder(projectId, projectName, cachedFolderId) {
  return getOrCreateProjectFolder(projectId, projectName, cachedFolderId);
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
