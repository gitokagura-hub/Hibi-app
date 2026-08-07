/**
 * Google Driveへの自動バックアップ(デバウンス方式)。
 *
 * これまでDriveバックアップは「Settings画面の手動ボタンを押した時だけ」動いていた。
 * 押し忘れると、その間の変更はD1(クラウドDB)にしか残らず、Driveには反映されない。
 * D1は普段確実に動くが、「Driveにも常に最新の控えがある」という安心感のために、
 * データが変わってからしばらく操作が止まったタイミングで自動的にも書き込む。
 *
 * 使い方: 各storeのuseEffect([data])の中で scheduleAutoBackup('brains', data) を呼ぶだけ。
 * 実際の書き込みは、直近の呼び出しから DEBOUNCE_MS 経っても新しい呼び出しが
 * 来なければ1回だけ実行される(Drive APIを叩きすぎないため)。Driveが未連携なら
 * 何もしない(エラーも出さない)。
 */

import { isDriveConnected } from './googleDrive';

const DEBOUNCE_MS = 60 * 1000; // 1分操作が止まったら書き込む
const timers = {};
// 各app内で最新のバックアップ対象を保持しておき、書き込み直前に集める。
const pending = {};

// 実際のDrive書き込み関数は呼び出し元から渡してもらう(googleDrive.jsのbackupDataToDriveや、
// アプリ専用の保存関数など、appごとに形が違う可能性があるため)。
export function scheduleAutoBackup(key, data, writeFn) {
  if (!isDriveConnected()) return; // 未連携なら何もしない(エラーも出さない)
  pending[key] = { data, writeFn };
  if (timers[key]) clearTimeout(timers[key]);
  timers[key] = setTimeout(async () => {
    const job = pending[key];
    delete pending[key];
    delete timers[key];
    if (!job || !isDriveConnected()) return;
    try {
      await job.writeFn(job.data);
    } catch {
      // オフラインやトークン切れ等。次の変更時に再度スケジュールされるので、
      // ここで無理にリトライはしない(手動の「バックアップする」ボタンも引き続き使える)。
    }
  }, DEBOUNCE_MS);
}
