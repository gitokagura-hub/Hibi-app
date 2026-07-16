/**
 * Daily Brains / Sukima / Timeless Analogue 共通のクラウド同期ユーティリティ。
 *
 * 仕組み:
 * - 各storeはこれまで通りlocalStorageに即座に保存する（オフラインでも動く・体感速度も速い）
 * - それに加えて、変更のたびに裏でこのAPI（D1）にも保存する
 * - 起動時、クラウドに既にデータがあればそれを優先して読み込む（他端末の更新を反映）
 * - クラウドがまだ空（初回）なら、端末内の既存データをそのままアップロードする（移行）
 *
 * これにより、Safariで書いたこともホーム画面アプリで書いたことも、同じデータとして見える。
 */

const API_BASE = "https://hibiapp.gito-kagura.workers.dev";
const API_TOKEN = "Le9PsVoMj-aiupu8QeMZU0I9i7V9EVtw";

export async function fetchCloud(app) {
  const res = await fetch(`${API_BASE}/api/data/${app}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`cloud fetch failed: ${res.status}`);
  return res.json(); // { found: boolean, data: any }
}

export async function saveCloud(app, data) {
  const res = await fetch(`${API_BASE}/api/data/${app}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`cloud save failed: ${res.status}`);
  return res.json();
}

/**
 * 起動時に1回呼ぶ。クラウドにデータがあればそれを、無ければローカルの既存データを
 * アップロードした上でローカルデータを返す。どちらもエラー時はローカルデータのまま進む
 * （オフラインでも壊れないように）。
 */
export async function reconcileOnStartup(app, localData) {
  try {
    const cloud = await fetchCloud(app);
    if (cloud.found && cloud.data) {
      return cloud.data;
    }
    // クラウドが空 → 端末内の既存データを移行としてアップロード
    await saveCloud(app, localData);
    return localData;
  } catch {
    // オフライン等。ローカルデータのまま続行し、次の保存時に再度同期を試みる
    return localData;
  }
}
