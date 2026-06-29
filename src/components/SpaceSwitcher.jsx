import { useData } from "../dataStore";
import { isTeamConfigured } from "../googleSheets";

export default function SpaceSwitcher() {
  const { space, switchSpace } = useData();
  if (!isTeamConfigured()) return null;

  return (
    <div className="px-5 pb-3">
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        <button
          onClick={() => switchSpace("personal")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
            space === "personal" ? "bg-gray-600 text-white shadow-sm" : "text-gray-500"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${space === "personal" ? "bg-white" : "bg-gray-400"}`} /> Personal
        </button>
        <button
          onClick={() => switchSpace("team")}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
            space === "team" ? "bg-gray-600 text-white shadow-sm" : "text-gray-500"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${space === "team" ? "bg-white" : "bg-blue-600"}`} /> ByMaeNikko Team
        </button>
      </div>
    </div>
  );
}
