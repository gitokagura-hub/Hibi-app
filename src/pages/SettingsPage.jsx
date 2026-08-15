import { useState, useEffect } from "react";
import { Layout } from "../components";
import { useData } from "../dataStore";
import { isDriveConfigured, isDriveConnected, wasDriveConnectedBefore, connectDrive, disconnectDrive, ensureDriveConnection, backupDataToDrive, restoreDataFromDrive } from "../googleDrive";
import { isTeamConfigured, isTeamConnected, connectTeam, disconnectTeam, getAuthorName, setAuthorName } from "../googleSheets";
import { useConfirm } from "../components/ConfirmModal";
import { isPushSupported, wasPushSubscribedBefore, notificationPermission, subscribeToPush, unsubscribeFromPush, resetServiceWorker } from "../pushNotifications";

function GroupHeader({ children }) {
  return (
    <h3 className="text-xs font-bold text-ink-sub uppercase pl-2 mb-2">{children}</h3>
  );
}

export default function SettingsPage({ setTab }) {
  const { data, setSettings, replaceAllData, refreshTeamData, runMediaMigration } = useData();
  const confirm = useConfirm();
  const [driveConnected, setDriveConnected] = useState(isDriveConnected());
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateMessage, setMigrateMessage] = useState("");
  const driveReady = isDriveConfigured();

  const [pushSubscribed, setPushSubscribed] = useState(wasPushSubscribedBefore() && notificationPermission() === "granted");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  const [teamConnected, setTeamConnected] = useState(isTeamConnected());
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamConnError, setTeamConnError] = useState("");
  const [authorName, setAuthorNameInput] = useState(getAuthorName());
  const teamReady = isTeamConfigured();

  useEffect(() => {
    // トークンが切れていても、以前接続済みなら裏で自動的に再接続を試みる
    // （同意画面は出さない。Googleセッションが切れてる場合だけ失敗し、その時だけ手動再接続が必要）
    if (isDriveConnected()) {
      setDriveConnected(true);
    } else if (wasDriveConnectedBefore()) {
      ensureDriveConnection()
        .then(() => setDriveConnected(true))
        .catch(() => setDriveConnected(false));
    }
  }, []);

  async function handlePushToggle() {
    setPushError("");
    if (pushSubscribed) {
      await unsubscribeFromPush();
      setPushSubscribed(false);
      return;
    }
    setPushBusy(true);
    try {
      await subscribeToPush();
      setPushSubscribed(true);
    } catch (err) {
      if (err.message === "PUSH_NOT_SUPPORTED") {
        setPushError("この端末・ブラウザは通知に対応していません。ホーム画面に追加したアプリから開いてください。");
      } else if (err.message === "PERMISSION_DENIED") {
        setPushError("通知が許可されませんでした。iPhoneの設定アプリから通知を許可してください。");
      } else {
        setPushError("通知の設定に失敗しました（" + (err?.message || "不明なエラー") + "）");
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDriveToggle() {
    setDriveError("");
    if (driveConnected) {
      disconnectDrive();
      setDriveConnected(false);
      return;
    }
    setDriveBusy(true);
    try {
      await connectDrive();
      setDriveConnected(true);
    } catch (err) {
      if (err.message === "GOOGLE_SCRIPT_NOT_LOADED") {
        setDriveError("読み込み中です。数秒待ってからもう一度お試しください。");
      } else if (err.error === "origin_mismatch" || err.type === "popup_failed_to_open") {
        setDriveError("このアプリのURLがGoogle側に未登録です（origin_mismatch）。Claudeに伝えてください。");
      } else {
        setDriveError("接続に失敗しました。もう一度お試しください。");
      }
    } finally {
      setDriveBusy(false);
    }
  }

  async function handleTeamToggle() {
    setTeamConnError("");
    if (teamConnected) {
      disconnectTeam();
      setTeamConnected(false);
      return;
    }
    setTeamBusy(true);
    try {
      await connectTeam();
      setTeamConnected(true);
      refreshTeamData();
    } catch (err) {
      if (err.message === "GOOGLE_SCRIPT_NOT_LOADED") {
        setTeamConnError("読み込み中です。数秒待ってからもう一度お試しください。");
      } else if (err.error === "origin_mismatch" || err.type === "popup_failed_to_open") {
        setTeamConnError("このアプリのURLがGoogle側に未登録です（origin_mismatch）。Claudeに伝えてください。");
      } else {
        setTeamConnError("接続に失敗しました。もう一度お試しください。");
      }
    } finally {
      setTeamBusy(false);
    }
  }

  function handleAuthorNameChange(value) {
    setAuthorNameInput(value);
    setAuthorName(value);
  }

  async function handleBackup() {
    setBackupMessage("");
    if (!driveConnected) {
      setBackupMessage("先にGoogle Driveと連携してください");
      return;
    }
    setBackupBusy(true);
    try {
      await backupDataToDrive(data);
      setBackupMessage("バックアップ完了（" + new Date().toLocaleString("ja-JP") + "）");
    } catch (err) {
      setBackupMessage("バックアップに失敗しました。もう一度お試しください。");
    } finally {
      setBackupBusy(false);
    }
  }

  // 埋め込まれたままの写真・ファイルをDriveへ移す。これによりデータ本体が
  // D1の2MB上限を下回り、止まっていたクラウド同期が復活する。
  async function handleMediaMigration() {
    setMigrateMessage("");
    if (!driveConnected) {
      setMigrateMessage("先にGoogle Driveと連携してください");
      return;
    }
    setMigrateBusy(true);
    try {
      const result = await runMediaMigration((done, total) => {
        setMigrateMessage(`Driveへ移行中… ${done} / ${total}`);
      });

      if (!result.ok) {
        if (result.reason === "NOT_CONNECTED") setMigrateMessage("Google Driveと連携してください");
        else setMigrateMessage("移行に失敗しました。データは変更していません。");
        return;
      }
      if (result.migrated === 0) {
        setMigrateMessage("移行が必要な写真・ファイルはありませんでした。");
        return;
      }

      const before = result.beforeMB.toFixed(2);
      const after = result.afterMB.toFixed(2);
      let msg = `${result.migrated}件をDriveへ移しました（データ量 ${before}MB → ${after}MB）。`;
      if (result.failures.length > 0) {
        msg += ` ${result.failures.length}件は移せなかったため、そのまま残しています。`;
      }
      setMigrateMessage(msg);
    } catch {
      setMigrateMessage("移行に失敗しました。データは変更していません。");
    } finally {
      setMigrateBusy(false);
    }
  }

  async function handleRestore() {
    setBackupMessage("");
    if (!driveConnected) {
      setBackupMessage("先にGoogle Driveと連携してください");
      return;
    }
    if (!(await confirm("Driveに保存されているバックアップで、現在のデータを上書きします。よろしいですか？", { confirmLabel: "復元する" }))) return;
    setBackupBusy(true);
    try {
      const { data: restored, modifiedTime } = await restoreDataFromDrive();
      replaceAllData(restored);
      setBackupMessage("復元完了（バックアップ日時: " + new Date(modifiedTime).toLocaleString("ja-JP") + "）");
    } catch (err) {
      if (err.message === "NO_BACKUP") setBackupMessage("Driveにバックアップが見つかりませんでした");
      else setBackupMessage("復元に失敗しました。もう一度お試しください。");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <Layout title="Settings" current="settings" setTab={setTab}>
      <div className="px-5">
        {/* Group 1: Google Suite Sync Setup */}
        <div className="mb-7">
          <GroupHeader>Google 連携設定</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-app-line">
              <span>Google Calendar 同期</span>
              <span className="text-ink-sub text-sm">未接続</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <span>Google Drive 連携</span>
                {!driveReady && <p className="text-xs text-ink-sub mt-1">未設定（Client ID未構成）</p>}
                {driveError && <p className="text-xs text-red-500 mt-1">{driveError}</p>}
              </div>
              {driveReady ? (
                <button
                  onClick={handleDriveToggle}
                  disabled={driveBusy}
                  className={`text-sm font-semibold rounded-full px-4 py-1.5 ${driveConnected ? "bg-ink text-app-bg" : "border border-app-line"}`}
                >
                  {driveBusy ? "…" : driveConnected ? "連携済" : "連携する"}
                </button>
              ) : (
                <span className="text-ink-sub text-sm">利用不可</span>
              )}
            </div>
          </div>
        </div>

        {/* Group 1.2: Team Space */}
        <div className="mb-7">
          <GroupHeader>ByMaeNikko Team 連携</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-app-line">
              <div>
                <span>共有スペースへの接続</span>
                {!teamReady && <p className="text-xs text-ink-sub mt-1">未設定（シートID未構成）</p>}
                {teamConnError && <p className="text-xs text-red-500 mt-1">{teamConnError}</p>}
              </div>
              {teamReady ? (
                <button
                  onClick={handleTeamToggle}
                  disabled={teamBusy}
                  className={`text-sm font-semibold rounded-full px-4 py-1.5 ${teamConnected ? "bg-ink text-app-bg" : "border border-app-line"}`}
                >
                  {teamBusy ? "…" : teamConnected ? "連携済" : "連携する"}
                </button>
              ) : (
                <span className="text-ink-sub text-sm">利用不可</span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span>表示する名前</span>
              </div>
              <input
                value={authorName}
                onChange={(e) => handleAuthorNameChange(e.target.value)}
                placeholder="例：Gito"
                className="w-full rounded-xl border p-2.5 text-sm"
              />
              <p className="text-xs text-ink-sub mt-1.5">Teamスペースに書いたノートやタスクに、この名前が表示されます。</p>
            </div>
          </div>
        </div>

        {/* Group 1.4: Task Reminder Notifications */}
        <div className="mb-7">
          <GroupHeader>タスクのリマインダー通知</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">🔔 通知を受け取る</p>
                <p className="text-xs text-ink-sub mt-0.5">Calendarで時刻を設定したタスクの時間になったら通知します</p>
              </div>
              <button
                onClick={handlePushToggle}
                disabled={pushBusy}
                className={`rounded-xl px-4 py-2 text-sm font-semibold flex-shrink-0 ${pushSubscribed ? "bg-app-raised text-ink-sub" : "bg-ink text-app-bg"}`}
              >
                {pushBusy ? "設定中…" : pushSubscribed ? "オフにする" : "オンにする"}
              </button>
            </div>
            {pushError && (
              <div className="px-4 pb-4">
                <p className="text-xs text-red-500 mb-2">{pushError}</p>
                <button
                  onClick={async () => {
                    setPushBusy(true);
                    try {
                      await resetServiceWorker();
                      window.location.reload();
                    } catch {
                      setPushError("リセットに失敗しました。もう一度お試しください。");
                      setPushBusy(false);
                    }
                  }}
                  className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5"
                >
                  🔄 通知の仕組みをリセットして再読み込み
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-sub mt-2 px-2">
            初回はホーム画面に追加したアプリから開いて設定してください。ブラウザから直接開いた場合、iPhoneでは通知が届かないことがあります。
          </p>
        </div>

        {/* Group 1.5: Backup & Restore */}
        <div className="mb-7">
          <GroupHeader>データのバックアップ</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden">
            <div className="p-4">
              <p className="text-sm text-ink-sub mb-3">
                {driveConnected
                  ? "カレンダー・ノート・プロジェクトのすべてのデータをGoogle Driveに保存・復元できます。"
                  : "バックアップを使うには、まず上のGoogle Driveと連携してください。"}
              </p>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={handleBackup}
                  disabled={!driveConnected || backupBusy}
                  className="flex-1 rounded-xl border border-app-line px-4 py-2.5 text-sm font-semibold bg-app-surface disabled:opacity-40"
                >
                  {backupBusy ? "…" : "バックアップする"}
                </button>
                <button
                  onClick={handleRestore}
                  disabled={!driveConnected || backupBusy}
                  className="flex-1 rounded-xl border border-app-line px-4 py-2.5 text-sm font-semibold bg-app-surface disabled:opacity-40"
                >
                  {backupBusy ? "…" : "復元する"}
                </button>
              </div>
              {backupMessage && <p className="text-xs text-ink-sub mt-1">{backupMessage}</p>}

              <div className="mt-4 pt-4 border-t border-app-line">
                <p className="text-sm text-ink-sub mb-3">
                  写真やファイルがアプリのデータの中に直接埋め込まれていると、データが重くなり
                  クラウド同期が止まります。Driveへ移すと同期が回復し、写真はDrive上で
                  普通の画像ファイルとして開けるようになります。
                </p>
                <button
                  onClick={handleMediaMigration}
                  disabled={!driveConnected || migrateBusy}
                  className="w-full rounded-xl border border-app-line px-4 py-2.5 text-sm font-semibold bg-app-surface disabled:opacity-40"
                >
                  {migrateBusy ? "…" : "写真・ファイルをDriveへ移行"}
                </button>
                {migrateMessage && <p className="text-xs text-ink-sub mt-2">{migrateMessage}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Group 2: AI Core Models Matrix */}
        <div className="mb-7">
          <GroupHeader>AI 連携コアマトリクス</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden">
            <div className="p-4 border-b border-app-line">
              <div className="flex items-center justify-between mb-2">
                <span>Claude（Notes画面のAI処理に使用）</span>
                <span className={data.settings.claudeKey ? "text-blue-600 font-semibold text-sm" : "text-ink-sub text-sm"}>
                  {data.settings.claudeKey ? "設定済" : "未設定"}
                </span>
              </div>
              <input
                type="password"
                value={data.settings.claudeKey}
                onChange={(e) => setSettings({ claudeKey: e.target.value })}
                placeholder="API キーを入力（console.anthropic.com）"
                className="w-full rounded-xl border p-2.5 text-sm"
              />
            </div>
            <div className="p-4 border-b border-app-line">
              <div className="flex items-center justify-between mb-2">
                <span>Gemini（Notes画面のAI処理に使用）</span>
                <span className={data.settings.geminiKey ? "text-blue-600 font-semibold text-sm" : "text-ink-sub text-sm"}>
                  {data.settings.geminiKey ? "設定済" : "未設定"}
                </span>
              </div>
              <input
                type="password"
                value={data.settings.geminiKey}
                onChange={(e) => setSettings({ geminiKey: e.target.value })}
                placeholder="API キーを入力（aistudio.google.com）"
                className="w-full rounded-xl border p-2.5 text-sm"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span>ChatGPT（設計パートナー）</span>
                <span className={data.settings.chatgptKey ? "text-blue-600 font-semibold text-sm" : "text-ink-sub text-sm"}>
                  {data.settings.chatgptKey ? "設定済" : "未設定"}
                </span>
              </div>
              <input
                type="password"
                value={data.settings.chatgptKey}
                onChange={(e) => setSettings({ chatgptKey: e.target.value })}
                placeholder="API キーを入力"
                className="w-full rounded-xl border p-2.5 text-sm"
              />
              <p className="text-[11px] text-ink-sub mt-1.5">ChatGPTはまだNotes画面のAI処理には接続されていません。</p>
            </div>
          </div>
          <p className="text-xs text-ink-sub mt-2 px-2">
            ここで保存したキーは端末内にのみ保存され、各プロバイダのAPIへの直接通信にのみ使われます。
          </p>
        </div>

        {/* Group 3: Information & Manuals */}
        <div className="pb-10">
          <GroupHeader>アプリケーション説明</GroupHeader>
          <div className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-ink-sub leading-relaxed mb-4">
            Dayliy Brains は「毎日開く、自分専用の思考整理アプリ」です。カレンダーによるスケジュール管理、低摩擦の壁打ちノート、それらを構造化するプロジェクトルームが連携します。
          </div>

          <GroupHeader>使い方ガイド</GroupHeader>
          <div className="rounded-2xl border border-app-line overflow-hidden divide-y divide-app-line">
            <UsageItem title="① Personal / Team の切り替え">
              Calendar・Notes・Projects画面の上部にあるタブで「Personal」と「ByMaeNikko Team」を切り替えられます。
              <br /><br />
              ・<strong>Personal</strong>：自分専用。この端末にだけ保存されます<br />
              ・<strong>Team</strong>：上の「ByMaeNikko Team連携」で連携すると使えます。仲間と同じデータを見たり書いたりできます
              <br /><br />
              仲間にも同じURLを開いてもらい、それぞれ「連携する」→「表示する名前」を設定してもらえば、お互いのTeamデータが繋がります。
            </UsageItem>

            <UsageItem title="② プロジェクトのファイル・写真ギャラリー">
              Projects画面でプロジェクトを開くと「📎 ファイル・写真」という欄があります。
              <br /><br />
              ここに写真やファイルを追加すると、自動的にGoogle Drive上の「Hibiアプリの画像 ＞ そのプロジェクト名」フォルダに保存されます。サムネイルをタップすればDrive上の実ファイルが開きます。
              <br /><br />
              ※ 使うには、先に「Google Drive 連携」が必要です。Team空間ではまだ使えません（Personalのみ）。
            </UsageItem>

            <UsageItem title="③ データのバックアップ・復元">
              「データのバックアップ」から、カレンダー・ノート・プロジェクトの全データをGoogle Driveに保存できます。
              <br /><br />
              アプリを消してしまった、機種変更した、という時は「復元する」を押せば元に戻ります（Google Drive連携が必要です）。
            </UsageItem>

            <UsageItem title="④ まだ使えない機能">
              以下はまだ実装中です：<br />
              ・Google Calendarとの同期<br />
              ・Gemini／ChatGPTキーを使った実際のAI呼び出し<br />
              ・ボイスメモの自動文字起こし
            </UsageItem>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function UsageItem({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-app-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-ink-sub text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs text-ink-sub leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
