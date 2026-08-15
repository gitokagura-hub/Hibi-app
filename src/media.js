/**
 * 写真・ファイルの保存と表示を一箇所にまとめた層。
 *
 * 【なぜ必要か】
 * これまで写真とファイルは base64 のままアプリのデータ本体(1つのJSON)に埋め込まれていた。
 * Cloudflare D1 には「1行あたり2,000,000バイト(2MB)」という上限があるため、写真が増えると
 * いずれ必ずクラウド保存が失敗する作りになっていた。2026-08-15、データ量が2.4MBに達し、
 * 実際に `cloud save failed: 500` が発生してクラウド保存が恒久的に止まった。
 *
 * 【どう直すか】
 * 実体は Google Drive に1ファイルずつ置き、アプリのデータ本体には参照文字列だけを持たせる。
 *   保存される値: "drive:1AbC..."  (従来は "data:image/jpeg;base64,/9j/4AAQ..." )
 * 参照文字列は数十バイトなので、写真が何百枚増えてもデータ本体は肥大化しない。
 *
 * 【既存データとの互換】
 * 既に base64 で保存されている写真・ファイルは、そのまま残しても表示できる。
 * resolveMedia() が "drive:" で始まるかどうかを見て振り分けるため、移行を急ぐ必要はない。
 *
 * 【Drive未連携のとき】
 * アップロードできないので、従来通り base64 にフォールバックする(写真が保存できない、
 * という事態は避ける)。ただしその場合はデータ本体が太るため、呼び出し元に警告を返す。
 */

import { isDriveConnected, uploadMedia, getImageUrl } from './googleDrive';

const DRIVE_PREFIX = 'drive:';

export function isDriveRef(src) {
  return typeof src === 'string' && src.startsWith(DRIVE_PREFIX);
}

export function driveIdFromRef(src) {
  return isDriveRef(src) ? src.slice(DRIVE_PREFIX.length) : null;
}

// 画像を指定サイズ以内に縮小し、JPEGのBlobとして返す。
// 従来の fileToCompressedDataUrl と同じ圧縮条件だが、data URL ではなく Blob を返す
// (Driveへはバイナリのまま上げた方が、base64化による約33%の肥大化を避けられる)。
function compressToBlob(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('COMPRESS_FAILED'))),
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToBase64DataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 写真を保存し、保存先を指す文字列を返す。
 * Drive連携済みなら "drive:ID"、未連携なら従来通りの base64 data URL。
 */
export async function saveImage(file) {
  const blob = await compressToBlob(file);
  if (isDriveConnected()) {
    try {
      const id = await uploadMedia(blob, (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg');
      return DRIVE_PREFIX + id;
    } catch {
      // アップロード失敗時は写真そのものを失う方が損害が大きいので、base64で残す。
    }
  }
  return await fileToBase64DataUrl(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
}

/**
 * 画像以外のファイルを保存する。戻り値の形は従来と同じ { name, type, dataUrl } で、
 * dataUrl の中身が "drive:ID" になる点だけが違う。呼び出し元を変えずに済ませるため。
 */
export async function saveAttachment(file) {
  if (isDriveConnected()) {
    try {
      const id = await uploadMedia(file, file.name);
      return { name: file.name, type: file.type, dataUrl: DRIVE_PREFIX + id };
    } catch {
      // 同上。失敗時はbase64で残す。
    }
  }
  return { name: file.name, type: file.type, dataUrl: await fileToBase64DataUrl(file) };
}

/**
 * 保存された値を、実際に表示・ダウンロードできるURLに変換する。
 * - "drive:ID"     → Driveから取得したBlobのobject URL(googleDrive.js側でキャッシュ済み)
 * - "data:..."     → そのまま返す(既存のbase64データ)
 */
export async function resolveMedia(src) {
  const id = driveIdFromRef(src);
  if (!id) return src;
  return await getImageUrl(id);
}
