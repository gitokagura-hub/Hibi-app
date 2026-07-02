import { ChevronLeft, Trash2 } from "lucide-react";
import { useTimeless, CATEGORIES, STATUS } from "../timelessStore";
import { useSwipeBack } from "../useSwipeBack";
import DriveGallery from "../components/DriveGallery";

export default function TimelessEditorPage({ articleId, onBack }) {
  useSwipeBack(onBack);
  const { getArticle, updateArticle, deleteArticle } = useTimeless();
  const article = getArticle(articleId);

  if (!article) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-gray-400">この記事は見つかりませんでした</p>
        <button onClick={onBack} className="mt-4 text-sm font-semibold" style={{ color: "#8C6B47" }}>
          一覧へ戻る
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <button
        onClick={onBack}
        className="fixed bottom-6 left-5 z-30 w-11 h-11 rounded-full bg-white/90 backdrop-blur border border-gray-200 flex items-center justify-center shadow-sm"
        aria-label="一覧へ戻る"
      >
        <ChevronLeft size={18} className="text-gray-600" />
      </button>

      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center justify-end px-4 pt-14 pb-2">
          <button
            onClick={() => {
              if (confirm(`「${article.title}」を削除しますか？`)) {
                deleteArticle(article.id);
                onBack();
              }
            }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <Trash2 size={16} className="text-red-400" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex gap-1.5 flex-wrap mb-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => updateArticle(article.id, { category: c.id })}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border"
                style={
                  article.category === c.id
                    ? { background: "#8C6B47", color: "#fff", borderColor: "#8C6B47" }
                    : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {STATUS.map((s) => (
              <button
                key={s.id}
                onClick={() => updateArticle(article.id, { status: s.id })}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  article.status === s.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <input
          value={article.title}
          onChange={(e) => updateArticle(article.id, { title: e.target.value })}
          placeholder="記事タイトル"
          className="w-full text-xl font-bold text-gray-900 focus:outline-none mb-4"
        />
        <textarea
          value={article.content}
          onChange={(e) => updateArticle(article.id, { content: e.target.value })}
          placeholder="ここに下書きを書いていく。音声メモの文字起こしをそのまま貼ってもOK。"
          rows={14}
          className="w-full text-[15px] leading-relaxed text-gray-800 focus:outline-none resize-none"
        />

        <div className="mt-5">
          <DriveGallery
            entityId={article.id}
            entityName={article.title || "無題の記事"}
            driveFolderId={article.driveFolderId}
            driveFiles={article.driveFiles}
            onFolderId={(id) => updateArticle(article.id, { driveFolderId: id })}
            onFilesChange={(files) => updateArticle(article.id, { driveFiles: files })}
            accentColor="#8C6B47"
          />
        </div>
      </div>
    </div>
  );
}
