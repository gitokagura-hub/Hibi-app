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

// Must be called from inside a direct user gesture (click handler) the first time.
export function connectDrive() {
  return new Promise((resolve, reject) => {
    const client = getClient();
    if (!client) { reject(new Error('Google Identity Services がまだ読み込まれていません')); return; }
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
