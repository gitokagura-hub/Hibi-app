# Dayliy Brains - 現状まとめ（2026/06/28時点）

## 公開URL・リポジトリ

- **本番URL**：Cloudflare Pagesで公開中（`.pages.dev`のURL。Netlifyの旧URLは今後使わない）
- **GitHubリポジトリ**：`gitokagura-hub/Hibi-app`（ここにソースコード一式）
- **デプロイ方法**：GitHubにコードがpushされると、Cloudflareが自動でビルド・公開（`npm run build` → `dist`フォルダを配信）
- **Netlifyは使用終了**：クレジット制限の問題があったため、Cloudflare Pagesに移行済み

## 技術構成

- React + Vite製のPWA（ホーム画面に追加してアプリのように使える）
- データ保存：ブラウザの`localStorage`のみ（端末内・同期なし）
- 画像・ファイル添付：外部サービスを使わず、ブラウザ内にbase64で直接保存

```
src/
  dataStore.jsx          状態管理（Context + localStorage）
  pages/
    CalendarPage.jsx      月表示＋Schedule/Task/Memo/Project Links
    NotesPage.jsx          壁打ちノート（フルスクリーン編集・Send機能あり）
    ProjectsPage.jsx       プロジェクト一覧＋連携ルーム
    SearchPage.jsx         横断検索
    SettingsPage.jsx       Google連携・AIキー設定
  components/
    Layout.jsx / Header.jsx / BottomNavigation.jsx
    AIConnections.jsx      ChatGPT/Claude/Gemini選択ピル（見た目のみ）
```

## 画面構成（下部タブ）

Calendar / Notes / Projects / Search / Settings

## 今動いている機能

- **Calendar**：月表示（タップで選択）、各日に予定・タスクを最大2件プレビュー表示、スクロールでSchedule/Task/Memo/Project Linksへ
- **Notes**：フルスクリーンで書ける、写真・ファイル添付、ボイスメモ（文字起こしは未接続）、カレンダー/プロジェクトへ「貼り付け」、新規作成時に直接プロジェクトへ「Send」
- **Projects**：作成・削除、タップで「連携ルーム」展開、中のノートをフルスクリーンで編集、削除
- **Search**：Calendar/Notes/Projects横断検索
- **Settings**：Googleドライブは実際に接続可能（OAuth）。Google Calendar連携・AIキーは見た目のみ

## まだ実体のない部分（今後の課題）

- Google Calendar同期（未接続）
- AIキー（Gemini/ChatGPT）を使った実際のAPI呼び出し
- 音声の自動文字起こし
- プロジェクトの「転送ボタン」（押しても何も起きない）
- プロジェクトの「Driveフォルダ名」は入力欄のみ（実際のフォルダとは紐付いていない）
- Claude/ChatGPT/Geminiピル（Notes画面）は選択状態が変わるだけの見た目

## 進め方のルール（これまでの運用）

- デザイン：ChatGPTが画像やコードでモックアップを出す → Claudeが忠実に実装
- 細かい挙動の不具合・調整はClaudeとのチャットで直接フィードバック
- 大きい節目では、ソース一式をZIPでChatGPTに渡して確認してもらう
