import { useState } from "react";
import { DataProvider } from "./dataStore";

import CalendarPage from "./pages/CalendarPage";
import TodayPage from "./pages/TodayPage";
import NotesPage from "./pages/NotesPage";
import ProjectsPage from "./pages/ProjectsPage";
import SearchPage from "./pages/SearchPage";

function Router() {
  const [tab, setTab] = useState("calendar");

  switch (tab) {
    case "today":
      return <TodayPage setTab={setTab} />;

    case "notes":
      return <NotesPage setTab={setTab} />;

    case "projects":
      return <ProjectsPage setTab={setTab} />;

    case "search":
      return <SearchPage setTab={setTab} />;

    default:
      return <CalendarPage setTab={setTab} />;
  }
}

export default function App() {
  return (
    <DataProvider>
      <Router />
    </DataProvider>
  );
}
