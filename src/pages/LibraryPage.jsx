import { useMemo } from "react";
import { ChevronLeft, Image as ImageIcon } from "lucide-react";
import { useData } from "../dataStore";
import { useSwipeBack } from "../useSwipeBack";

export default function LibraryPage({ onHome }) {
  useSwipeBack(onHome);
  const { data } = useData();

  // Daily Brains内の3つの保存場所（Notes / Calendar memos / Projects）を横断して画像を集約
  const images = useMemo(() => {
    const items = [];

    (data.notes || []).forEach((n) =>
      (n.images || []).forEach((src) =>
        items.push({ src, source: "Notes", createdAt: n.createdAt })
      )
    );

    Object.entries(data.memos || {}).forEach(([date, memo]) =>
      (memo.images || []).forEach((src) =>
        items.push({ src, source: `Calendar / ${date}`, createdAt: new Date(date).getTime() })
      )
    );

    (data.projects || []).forEach((p) =>
      (p.items || []).forEach((it) =>
        (it.images || []).forEach((src) =>
          items.push({ src, source: `Projects / ${p.name}`, createdAt: it.createdAt })
        )
      )
    );

    return items.sort((a, b) => b.createdAt - a.createdAt);
  }, [data]);

  return (
    <div className="min-h-screen bg-white relative">
      <button
        onClick={onHome}
        className="fixed bottom-6 left-5 z-30 w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>

      <header className="px-5 pt-14 pb-3">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          {images.length}件の画像（Daily Brains内 / Notes・Calendar・Projects横断）
        </p>
      </header>

      <main className="px-5 pb-24">
        {images.length === 0 ? (
          <div className="mt-20 flex flex-col items-center text-center text-gray-400">
            <ImageIcon size={32} />
            <p className="mt-3 text-sm">まだ画像がありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg overflow-hidden bg-gray-100"
                title={img.source}
              >
                <img src={img.src} alt={img.source} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
