import { useState } from "react";
import { DataProvider } from "./dataStore";
import { ConfirmProvider } from "./components/ConfirmModal";

import CalendarPage from "./pages/CalendarPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

function Router() {
  const [tab, setTab] = useState("calendar");

  switch (tab) {
    case "notes":
      return <NotesPage setTab={setTab} />;
    case "projects":
      return <ProjectsPage setTab={setTab} />;
    case "search":
      return <SearchPage setTab={setTab} />;
    case "settings":
      return <SettingsPage setTab={setTab} />;
    default:
      return <CalendarPage setTab={setTab} />;
  }
}

export default function App() {
  return (
    <DataProvider>
      <ConfirmProvider>
        <Router />
      </ConfirmProvider>
    </DataProvider>
  );
}
