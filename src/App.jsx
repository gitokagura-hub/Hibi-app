import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DataProvider } from "./dataStore";
import { ConfirmProvider } from "./components/ConfirmModal";
import { useSwipeBack } from "./useSwipeBack";

import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import SukimaListPage from "./pages/SukimaListPage";
import SukimaDetailPage from "./pages/SukimaDetailPage";
import { SukimaProvider } from "./sukimaStore";
import TimelessListPage from "./pages/TimelessListPage";
import TimelessEditorPage from "./pages/TimelessEditorPage";
import { TimelessProvider } from "./timelessStore";
import CalendarPage from "./pages/CalendarPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import ReaderPage from "./pages/ReaderPage";

// Daily Brains（既存5画面）用のルーター。中身は元のApp.jsxのRouterと同一。
function DailyBrainsRouter({ onHome }) {
  useSwipeBack(onHome);
  const [tab, setTab] = useState("calendar");

  let page;
  switch (tab) {
    case "notes":
      page = <NotesPage setTab={setTab} />;
      break;
    case "projects":
      page = <ProjectsPage setTab={setTab} />;
      break;
    case "search":
      page = <SearchPage setTab={setTab} />;
      break;
    case "settings":
      page = <SettingsPage setTab={setTab} />;
      break;
    default:
      page = <CalendarPage setTab={setTab} />;
  }

  return (
    <div className="relative">
      {/* Homeへ戻るボタン。既存Layout/pagesは一切変更せず、上に浮かせるだけ */}
      <button
        onClick={onHome}
        className="fixed right-4 z-30 w-12 h-12 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center shadow-lg"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)" }}
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={22} className="text-sky-700" />
      </button>
      {page}
    </div>
  );
}

// Sukima（人物/企業リサーチ）。一覧⇔詳細の内部遷移を持つので専用ルーター。
function SukimaApp({ onHome }) {
  const [openId, setOpenId] = useState(null);
  return (
    <SukimaProvider>
      {openId ? (
        <SukimaDetailPage entryId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <SukimaListPage onHome={onHome} onOpenEntry={setOpenId} />
      )}
    </SukimaProvider>
  );
}

// Timeless Analogue（下書きワークスペース）。一覧⇔エディタの内部遷移を持つので専用ルーター。
function TimelessApp({ onHome }) {
  const [openId, setOpenId] = useState(null);
  return (
    <TimelessProvider>
      {openId ? (
        <TimelessEditorPage articleId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <TimelessListPage onHome={onHome} onOpenArticle={setOpenId} />
      )}
    </TimelessProvider>
  );
}

function AppRouter() {
  // "home" | "brains" | "sukima" | "timeless" | "library"
  const [app, setApp] = useState("home");

  if (app === "brains") {
    return <DailyBrainsRouter onHome={() => setApp("home")} />;
  }
  if (app === "sukima") {
    return <SukimaApp onHome={() => setApp("home")} />;
  }
  if (app === "timeless") {
    return <TimelessApp onHome={() => setApp("home")} />;
  }
  if (app === "library") {
    return <LibraryPage onHome={() => setApp("home")} />;
  }
  if (app === "reader") {
    return <ReaderPage onHome={() => setApp("home")} />;
  }
  return <HomePage onSelect={setApp} />;
}

export default function App() {
  return (
    <DataProvider>
      <ConfirmProvider>
        <AppRouter />
      </ConfirmProvider>
    </DataProvider>
  );
}
