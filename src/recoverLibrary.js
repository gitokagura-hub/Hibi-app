/**
 * Drive上にある写真・ファイルの実体から、アプリ内の一覧を作り直す復旧処理。
 *
 * 【背景】
 * 2026-08-15、写真をDriveへ移行した直後に「復元する」が押され、移行後の状態が
 * 古いバックアップで上書きされた。その結果、D1上のデータは libraryPhotos:[] /
 * libraryFiles:[] と空になり、アプリから写真が見えなくなった。
 * 一方で実体は Drive の「Daily Brains / Media」フォルダに無事残っている
 * (移行が複数回走ったため重複もある)。
 *
 * この処理は、そのフォルダの中身を読んで libraryPhotos / libraryFiles を
 * 組み立て直す。Drive側のファイルには一切手を触れない(消さない・動かさない)。
 *
 * 【重複について】
 * 移行ボタンが3回押されたため、同じ写真が複数回アップロードされている。
 * ファイル名は "<タイムスタンプ>-photo-1.jpg" の形式で、タイムスタンプ以降が
 * 同じものは同一の写真とみなして1枚にまとめる。
 *
 * 【既存データを壊さないための方針】
 * - 既に一覧に載っている drive参照 は二重に追加しない
 * - 既存の項目は削除しない(追加のみ)
 * - 写真に付いていたコメント/タグは drive参照 をキーにして残っているため、
 *   参照が一致すればそのまま復活する
 */

import { ensureDriveReady, ensureMediaFolder, listProjectFiles } from './googleDrive';

// "1786768180467-photo-1.jpg" -> "photo-1.jpg"
// 先頭のタイムスタンプを落とすと、同じ写真を何度アップロードしても同じ名前になる。
function baseName(name) {
  return String(name || '').replace(/^\d{10,}-/, '');
}

function isImage(f) {
  return (f.mimeType || '').startsWith('image/');
}

export async function recoverLibraryFromDrive(data) {
  if (!(await ensureDriveReady())) {
    return { ok: false, reason: 'NOT_CONNECTED' };
  }

  const folderId = await ensureMediaFolder();
  const files = await listProjectFiles(folderId);

  if (files.length === 0) {
    return { ok: true, addedPhotos: 0, addedFiles: 0, data: null };
  }

  // 同じ写真が複数回アップロードされている分をまとめる。
  // 同名のものが複数あれば、最初にアップロードされた1件だけを採用する。
  const unique = new Map(); // baseName -> file
  for (const f of files) {
    const key = baseName(f.name);
    const prev = unique.get(key);
    if (!prev || new Date(f.createdTime) < new Date(prev.createdTime)) {
      unique.set(key, f);
    }
  }

  // 既に一覧に載っている参照は追加しない(二重登録を防ぐ)。
  const existingPhotoRefs = new Set((data.libraryPhotos || []).map((p) => p.src));
  const existingFileRefs = new Set((data.libraryFiles || []).map((f) => f.dataUrl));

  const newPhotos = [];
  const newFiles = [];

  for (const f of unique.values()) {
    const ref = `drive:${f.id}`;
    const createdAt = f.createdTime ? new Date(f.createdTime).getTime() : Date.now();
    if (isImage(f)) {
      if (existingPhotoRefs.has(ref)) continue;
      newPhotos.push({ id: `rec-${f.id}`, src: ref, createdAt });
    } else {
      if (existingFileRefs.has(ref)) continue;
      newFiles.push({
        id: `rec-${f.id}`,
        name: baseName(f.name),
        type: f.mimeType || '',
        dataUrl: ref,
        folderId: null,
        createdAt,
      });
    }
  }

  if (newPhotos.length === 0 && newFiles.length === 0) {
    return { ok: true, addedPhotos: 0, addedFiles: 0, data: null };
  }

  const next = {
    ...data,
    libraryPhotos: [...(data.libraryPhotos || []), ...newPhotos],
    libraryFiles: [...(data.libraryFiles || []), ...newFiles],
  };

  return {
    ok: true,
    addedPhotos: newPhotos.length,
    addedFiles: newFiles.length,
    totalInDrive: files.length,
    data: next,
  };
}
