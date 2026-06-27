# Dayliy Brains

React + Vite製のPWA。デザインはChatGPT（GPT-5.5）が決定し、Claudeが実装を担当。

## セットアップ

```bash
npm install
npm run dev      # http://localhost:5173 で確認
npm run build    # dist/ に本番用ファイルを生成
```

## 構成

```
src/
  App.jsx              タブ切り替えのルーター（DataProviderでラップ）
  dataStore.jsx         状態管理（Context + localStorage永続化）
  googleDrive.js        Googleドライブ連携（現在未使用・将来の写真機能用に保持）
  index.css             Tailwindベース
  main.jsx              エントリーポイント
  pages/
    CalendarPage.jsx     月表示カレンダー + 選択日のTask/Memo
    TodayPage.jsx        今日のTask/Memoのみ
    NotesPage.jsx        壁打ち用ノート一覧 + 音声入力 + 貼り付け
    ProjectsPage.jsx     プロジェクト一覧
    SearchPage.jsx       Calendar/Notes/Projects横断検索
    index.js             バレルエクスポート
  components/
    Layout.jsx           Header + スクロール領域 + BottomNavigation
    Header.jsx           タイトル + サブタイトル
    BottomNavigation.jsx 5タブ固定ナビ（Calendar/Today/Notes/Projects/Search）
    index.js             バレルエクスポート
```

## 実装メモ（ChatGPTのモックアップに無かった部分の最小限の補完）

以下はモックアップ画像/コードに具体的なUIが無かったため、機能として動かすために最小限追加した部分です。次回のモックアップで仕様が示されたら、その通りに差し替えます。

- **Task/Memoの保存先**：日付ごとにTask一覧（配列）とMemo（テキスト1本）を保持。Calendar・Todayの両画面で同じデータを参照。
- **Notesの新規作成（テキスト）**：モックアップにはNote一覧と🎤ボタンのみ示されていたため、テキストでも追加できる入力欄を追加。
- **Projectsの新規作成**：モックアップは一覧のみだったため、プロジェクト名を入力する欄を追加。
- **音声会話（VoiceCapture）**：マイクボタン→録音中UI→終了、の流れは実装。音声の自動文字起こし（STT）は未接続のため、終了後にテキストで内容を入力して保存する暫定UIになっている。
- **カレンダーの選択日/今日の見た目**：モックアップのコードでは無地のセルだったため、選択日=黒背景、今日=黒い枠線のみを最小限追加（白・黒・グレーの配色のみを使用）。

## データ

保存先はブラウザの`localStorage`のみ（端末内・同期なし）。
