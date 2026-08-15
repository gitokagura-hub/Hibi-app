/**
 * 既存の base64 写真・ファイルを Google Drive へ移行する一度きりの処理。
 *
 * 【背景】
 * これまで写真とファイルは base64 のままアプリのデータ本体(1つのJSON)に埋め込まれていた。
 * Cloudflare D1 には「1行あたり2,000,000バイト(2MB)」の上限があり、2026-08-15にデータ量が
 * 2.4MBに達して `cloud save failed: 500` が発生、クラウド同期が恒久的に停止した。
 *
 * この処理は、埋め込まれている実体をすべて Drive 上の普通のファイル(JPEG/PDF等)として
 * 保存し直し、データ本体には "drive:ID" という短い参照だけを残す。結果としてデータ量が
 * 数十KBまで落ち、同期が復活する。同時に、写真が Drive 上で普通に開ける画像として
 * 取り出せるようになる。
 *
 * 【安全設計】
 * - すべてのアップロードが終わってから、最後に一度だけデータを差し替える(途中で失敗しても
 *   元のデータには一切手を触れない)。
 * - アップロードに失敗した項目は base64 のまま残す(消さない)。
 * - 写真のタグ・コメントは base64 文字列をキーにして保存されているため、参照への
 *   張り替えと同時にキーも移し替える(これを忘れるとタグが迷子になる)。
 */

import { ensureDriveReady, uploadMedia } from './googleDrive';

function isBase64Ref(v) {
  return typeof v === 'string' && v.startsWith('data:');
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?)(;|$)/)?.[1] || 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extFromMime(mime) {
  if (!mime) return 'bin';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'application/pdf') return 'pdf';
  const guess = mime.split('/')[1];
  return guess ? guess.split(';')[0] : 'bin';
}

// データ全体を歩いて、埋め込まれている base64 を集める。
// 同じ写真が複数箇所から参照されている場合に二重アップロードしないよう、
// base64文字列そのものをキーにして重複を除く。
function collectBase64(data) {
  const found = new Map(); // base64 -> 表示用の名前

  const addImage = (v) => { if (isBase64Ref(v) && !found.has(v)) found.set(v, null); };
  const addFile = (f) => {
    if (f && isBase64Ref(f.dataUrl) && !found.has(f.dataUrl)) found.set(f.dataUrl, f.name || null);
  };

  for (const memo of Object.values(data.memos || {})) {
    (memo.images || []).forEach(addImage);
    (memo.files || []).forEach(addFile);
  }
  for (const n of data.notes || []) {
    (n.images || []).forEach(addImage);
    (n.files || []).forEach(addFile);
  }
  for (const p of data.projects || []) {
    for (const it of p.items || []) {
      (it.images || []).forEach(addImage);
      (it.files || []).forEach(addFile);
    }
  }
  for (const ph of data.libraryPhotos || []) addImage(ph.src);
  for (const lf of data.libraryFiles || []) addFile(lf);

  return found;
}

// 集めた base64 を1件ずつ Drive に上げ、base64 -> "drive:ID" の対応表を作る。
async function uploadAll(found, onProgress) {
  const map = new Map();
  const failures = [];
  let done = 0;
  for (const [b64, name] of found.entries()) {
    try {
      const blob = dataUrlToBlob(b64);
      const fileName = name || `photo-${done + 1}.${extFromMime(blob.type)}`;
      const id = await uploadMedia(blob, fileName);
      map.set(b64, `drive:${id}`);
    } catch (e) {
      failures.push(name || '(名称なし)');
    }
    done += 1;
    if (onProgress) onProgress(done, found.size);
  }
  return { map, failures };
}

// 対応表をもとにデータ全体を作り直す。対応表に無いもの(アップロード失敗分)は
// base64 のまま残るので、写真が失われることはない。
function rewrite(data, map) {
  const sub = (v) => (map.get(v) || v);
  const subFile = (f) => (f && map.has(f.dataUrl) ? { ...f, dataUrl: map.get(f.dataUrl) } : f);

  const memos = {};
  for (const [date, memo] of Object.entries(data.memos || {})) {
    memos[date] = {
      ...memo,
      images: (memo.images || []).map(sub),
      files: (memo.files || []).map(subFile),
    };
  }

  const notes = (data.notes || []).map((n) => ({
    ...n,
    images: (n.images || []).map(sub),
    files: (n.files || []).map(subFile),
  }));

  const projects = (data.projects || []).map((p) => ({
    ...p,
    items: (p.items || []).map((it) => ({
      ...it,
      images: (it.images || []).map(sub),
      files: (it.files || []).map(subFile),
    })),
  }));

  const libraryPhotos = (data.libraryPhotos || []).map((ph) => ({ ...ph, src: sub(ph.src) }));
  const libraryFiles = (data.libraryFiles || []).map(subFile);

  // タグとコメントは写真のsrc(=base64文字列)をキーにしているため、
  // 参照へ張り替えると同時にキーも移し替える必要がある。
  const remapKeyed = (obj) => {
    const out = {};
    for (const [key, val] of Object.entries(obj || {})) out[sub(key)] = val;
    return out;
  };

  return {
    ...data,
    memos,
    notes,
    projects,
    libraryPhotos,
    libraryFiles,
    libraryTags: remapKeyed(data.libraryTags),
    libraryComments: remapKeyed(data.libraryComments),
  };
}

/**
 * 移行を実行する。成功しても失敗しても、返り値を見れば何が起きたか分かるようにしてある。
 * 実際のデータ差し替えは呼び出し元が result.data を setData する形にして、
 * この関数自体は副作用を持たせない(途中で止まってもデータが壊れないようにするため)。
 */
export async function migrateMediaToDrive(data, onProgress) {
  if (!(await ensureDriveReady())) {
    return { ok: false, reason: 'NOT_CONNECTED' };
  }

  const beforeMB = JSON.stringify(data).length / 1024 / 1024;
  const found = collectBase64(data);

  if (found.size === 0) {
    return { ok: true, migrated: 0, failures: [], beforeMB, afterMB: beforeMB, data: null };
  }

  const { map, failures } = await uploadAll(found, onProgress);

  if (map.size === 0) {
    return { ok: false, reason: 'ALL_FAILED', failures };
  }

  const next = rewrite(data, map);
  const afterMB = JSON.stringify(next).length / 1024 / 1024;

  return {
    ok: true,
    migrated: map.size,
    failures,
    beforeMB,
    afterMB,
    data: next,
  };
}
