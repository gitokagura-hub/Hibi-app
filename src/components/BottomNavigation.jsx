import {
  CalendarDays,
  SquareCheckBig,
  NotebookPen,
  FolderKanban,
  Search,
} from "lucide-react";

export default function BottomNavigation({ current, setTab }) {
  const items = [
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "today", label: "Today", icon: SquareCheckBig },
    { id: "notes", label: "Notes", icon: NotebookPen },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "search", label: "Search", icon: Search },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-20 flex items-center justify-around">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className="flex flex-col items-center justify-center gap-1"
          >
            <Icon
              size={22}
              className={current === item.id ? "text-black" : "text-gray-400"}
            />
            <span
              className={`text-xs ${
                current === item.id
                  ? "font-semibold text-black"
                  : "text-gray-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
