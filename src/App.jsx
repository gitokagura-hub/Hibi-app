import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DataProvider } from "./dataStore";
import { ConfirmProvider } from "./components/ConfirmModal";

import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import CalendarPage from "./pages/CalendarPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

// Daily Brains（既存5画面）用のルーター。中身は元のApp.jsxのRouterと同一。
function DailyBrainsRouter({ onHome }) {
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
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      {page}
    </div>
  );
}

// Sukima / Timeless Analogue はまだ未実装。仮のプレースホルダー。
function ComingSoonPage({ title, onHome }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative">
      <button
        onClick={onHome}
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">まだ実装されていません。</p>
    </div>
  );
}

function AppRouter() {
  // "home" | "brains" | "sukima" | "timeless" | "library"
  const [app, setApp] = useState("home");

  if (app === "brains") {
    return <DailyBrainsRouter onHome={() => setApp("home")} />;
  }
  if (app === "sukima") {
    return <ComingSoonPage title="Sukima" onHome={() => setApp("home")} />;
  }
  if (app === "timeless") {
    return <ComingSoonPage title="Timeless Analogue" onHome={() => setApp("home")} />;
  }
  if (app === "library") {
    return <LibraryPage onHome={() => setApp("home")} />;
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
}import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DataProvider } from "./dataStore";
import { ConfirmProvider } from "./components/ConfirmModal";

import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import SukimaListPage from "./pages/SukimaListPage";
import SukimaDetailPage from "./pages/SukimaDetailPage";
import { SukimaProvider } from "./sukimaStore";
import CalendarPage from "./pages/CalendarPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

// Daily Brains（既存5画面）用のルーター。中身は元のApp.jsxのRouterと同一。
function DailyBrainsRouter({ onHome }) {
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
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
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

// Timeless Analogue はまだ未実装。仮のプレースホルダー。
function ComingSoonPage({ title, onHome }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative">
      <button
        onClick={onHome}
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">まだ実装されていません。</p>
    </div>
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
    return <ComingSoonPage title="Timeless Analogue" onHome={() => setApp("home")} />;
  }
  if (app === "library") {
    return <LibraryPage onHome={() => setApp("home")} />;
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
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { DataProvider } from "./dataStore";
import { ConfirmProvider } from "./components/ConfirmModal";

import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import SukimaListPage from "./pages/SukimaListPage";
import SukimaDetailPage from "./pages/SukimaDetailPage";
import { SukimaProvider } from "./sukimaStore";
import CalendarPage from "./pages/CalendarPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

// Daily Brains（既存5画面）用のルーター。中身は元のApp.jsxのRouterと同一。
function DailyBrainsRouter({ onHome }) {
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
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
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

// Timeless Analogue はまだ未実装。仮のプレースホルダー。
function ComingSoonPage({ title, onHome }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center relative">
      <button
        onClick={onHome}
        className="fixed top-3 left-3 z-30 w-9 h-9 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">まだ実装されていません。</p>
    </div>
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
    return <ComingSoonPage title="Timeless Analogue" onHome={() => setApp("home")} />;
  }
  if (app === "library") {
    return <LibraryPage onHome={() => setApp("home")} />;
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

