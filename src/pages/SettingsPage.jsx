import { useState, useEffect } from "react";
import { Layout } from "../components";
import { useData } from "../dataStore";
import { isDriveConfigured, isDriveConnected, wasDriveConnectedBefore, connectDrive, disconnectDrive } from "../googleDrive";

function GroupHeader({ children }) {
  return (
    <h3 className="text-xs font-bold text-gray-500 uppercase pl-2 mb-2">{children}</h3>
  );
}

export default function SettingsPage({ setTab }) {
  const { data, setSettings } = useData();
  const [driveConnected, setDriveConnected] = useState(isDriveConnected());
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState("");
  const driveReady = isDriveConfigured();

  useEffect(() => {
    setDriveConnected(isDriveConnected());
  }, []);

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
      setDriveError("接続に失敗しました。もう一度お試しください。");
    } finally {
      setDriveBusy(false);
    }
  }

  return (
    <Layout title="Settings" current="settings" setTab={setTab}>
      <div className="px-5">
        {/* Group 1: Google Suite Sync Setup */}
        <div className="mb-7">
          <GroupHeader>Google 連携設定</GroupHeader>
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100">
              <span>Google Calendar 同期</span>
              <span className="text-gray-400 text-sm">未接続</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div>
                <span>Google Drive 連携</span>
                {!driveReady && <p className="text-xs text-gray-400 mt-1">未設定（Client ID未構成）</p>}
                {driveError && <p className="text-xs text-red-500 mt-1">{driveError}</p>}
              </div>
              {driveReady ? (
                <button
                  onClick={handleDriveToggle}
                  disabled={driveBusy}
                  className={`text-sm font-semibold rounded-full px-4 py-1.5 ${driveConnected ? "bg-black text-white" : "border border-gray-300"}`}
                >
                  {driveBusy ? "…" : driveConnected ? "連携済" : "連携する"}
                </button>
              ) : (
                <span className="text-gray-400 text-sm">利用不可</span>
              )}
            </div>
          </div>
        </div>

        {/* Group 2: AI Core Models Matrix */}
        <div className="mb-7">
          <GroupHeader>AI 連携コアマトリクス</GroupHeader>
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100">
              <span>Claude（実装コア）</span>
              <span className="text-gray-400 text-sm">このアプリ自体（接続不要）</span>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span>Gemini（UI・設計コア）</span>
                <span className={data.settings.geminiKey ? "text-blue-600 font-semibold text-sm" : "text-gray-400 text-sm"}>
                  {data.settings.geminiKey ? "設定済" : "未設定"}
                </span>
              </div>
              <input
                type="password"
                value={data.settings.geminiKey}
                onChange={(e) => setSettings({ geminiKey: e.target.value })}
                placeholder="API キーを入力"
                className="w-full rounded-xl border p-2.5 text-sm"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span>ChatGPT（設計パートナー）</span>
                <span className={data.settings.chatgptKey ? "text-blue-600 font-semibold text-sm" : "text-gray-400 text-sm"}>
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
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2 px-2">
            ここで保存したキーは端末内にのみ保存されます。現時点ではキーを使った実際の呼び出しはまだ接続していません。
          </p>
        </div>

        {/* Group 3: Information & Manuals */}
        <div className="pb-10">
          <GroupHeader>アプリケーション説明</GroupHeader>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 leading-relaxed">
            Dayliy Brains は「毎日開く、自分専用の思考整理アプリ」です。カレンダーによるスケジュール管理、低摩擦の壁打ちノート、それらを構造化するプロジェクトルームが連携します。
          </div>
        </div>
      </div>
    </Layout>
  );
}
