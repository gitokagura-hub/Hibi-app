import { createContext, useContext, useState, useEffect } from "react";

/* =========================================================================
   Timeless Analogue 専用データストア
   Daily Brains / Sukima とは完全独立（Home直下の対等な枝という設計方針）。
   ここは「まだ構想・原稿が固まってない」段階の下書きワークスペース。
   固まった原稿だけ、後日 timelessanalogue.com（WordPress）へ清書・公開する想定。
   ========================================================================= */

const STORAGE_KEY = "timeless-data-v1";

// Notionで確定済みのサイト構成（6セクション）
const CATEGORIES = [
  { id: "about", label: "About", jp: "経歴・想い" },
  { id: "sense", label: "Sense by Hand", jp: "木造現場" },
  { id: "muzic", label: "Muzic", jp: "音・原点" },
  { id: "culture", label: "Culture", jp: "日本文化" },
  { id: "sake", label: "Sake", jp: "酒を通した文化" },
  { id: "projects", label: "Projects", jp: "実活動" },
];

const STATUS = [
  { id: "draft", label: "下書き" },
  { id: "done", label: "完成" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function seedData() {
  return {
    articles: [
      {
        id: uid(),
        title: "SENSE BY HAND — はじめに",
        category: "sense",
        status: "done",
        content:
          "30年間、現場に立ち続けて見えてきたもの。道具より先に、段取りを覚えろと言われる理由から始まる、木造大工の視点。\n\n（Notionで原稿確定済み。ここに全文を移して整えていく）",
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
        updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      },
      {
        id: uid(),
        title: "注文住宅の現場が進まない3つの本当の原因",
        category: "sense",
        status: "draft",
        content: "現役の大工が教える、お施主様ができる解決策。",
        createdAt: Date.now() - 1000 * 60 * 60 * 24,
        updatedAt: Date.now() - 1000 * 60 * 60 * 24,
      },
      {
        id: uid(),
        title: "レイヴカルチャーと木造現場に共通する感覚",
        category: "muzic",
        status: "draft",
        content: "大自然と音楽の融合体験から、現場の段取りへ。",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // noop
  }
  return seedData();
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // noop
  }
}

const TimelessContext = createContext(null);

export function TimelessProvider({ children }) {
  const [data, setData] = useState(loadData);

  useEffect(() => {
    saveData(data);
  }, [data]);

  function addArticle(title, category) {
    const article = {
      id: uid(),
      title: title || "無題の記事",
      category,
      status: "draft",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setData((d) => ({ ...d, articles: [article, ...d.articles] }));
    return article.id;
  }

  function updateArticle(id, patch) {
    setData((d) => ({
      ...d,
      articles: d.articles.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a
      ),
    }));
  }

  function deleteArticle(id) {
    setData((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== id) }));
  }

  function getArticle(id) {
    return data.articles.find((a) => a.id === id);
  }

  const value = {
    articles: data.articles,
    addArticle,
    updateArticle,
    deleteArticle,
    getArticle,
  };

  return <TimelessContext.Provider value={value}>{children}</TimelessContext.Provider>;
}

export function useTimeless() {
  const ctx = useContext(TimelessContext);
  if (!ctx) throw new Error("useTimeless must be used within TimelessProvider");
  return ctx;
}

export { CATEGORIES, STATUS };
