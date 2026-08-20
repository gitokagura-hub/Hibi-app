import {
  CalendarDays,
  NotebookPen,
  FolderKanban,
  Folder,
  Settings as SettingsIcon,
} from "lucide-react";

export default function BottomNavigation({ current, setTab }) {
  const items = [
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "notes", label: "Notes", icon: NotebookPen },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "search", label: "Files", icon: Folder },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <nav
      // z-40: シートやモーダル(z-50以上)より下に来るように明示する。
      // 指定がないと後から描画された分だけ手前に来て、シートを覆ってしまう。
      className="fixed bottom-0 left-0 right-0 z-40 bg-app-bg/90 backdrop-blur-xl border-t border-app-line h-20 flex items-center justify-around"
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
            <Icon size={22} className={active ? "text-ink" : "text-ink-sub"} />
            <span className={`text-xs ${active ? "font-semibold text-ink" : "text-ink-sub"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
