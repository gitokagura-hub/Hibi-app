import {
  CalendarDays,
  NotebookPen,
  FolderKanban,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";

export default function BottomNavigation({ current, setTab }) {
  const items = [
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "notes", label: "Notes", icon: NotebookPen },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "search", label: "Search", icon: Search },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-20 flex items-center justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className="flex flex-col items-center justify-center gap-1"
          >
            <Icon size={22} className={active ? "text-black" : "text-gray-400"} />
            <span className={`text-xs ${active ? "font-semibold text-black" : "text-gray-400"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
