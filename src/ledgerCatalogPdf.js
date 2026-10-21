/**
 * Now on sale の商品一覧を、アプリの画面と同じ見た目のPDFにして共有する。
 *
 * 日本語を含むPDFは、文字の形をPDFに埋め込まないと化ける。フォントを丸ごと
 * 積むとアプリが重くなるため、画面をそのまま画像にしてPDFに貼る方式にした。
 * 端末の文字で描かれるので化けず、見た目も画面と揃う。
 */

// 紙に刷るものではなく、相手の画面で見てもらうもの。A4に収めると
// アプリの見た目が縮んで文字が読みづらくなるため、iPhoneの画面に近い
// 細長いページにして、画面と同じ大きさのまま出す。
const CARD_W_PX = 390;  // iPhoneの横幅(CSSピクセル)
const PT_PER_PX = 0.75; // 1px = 0.75pt。画面の見た目をそのままptに移す
const PAGE_W = CARD_W_PX * PT_PER_PX;
const MARGIN = 12;

function fmtYen(n) {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtSigned(n) {
  const v = Number(n);
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

function pairingTextOf(p) {
  if (typeof p.pairingNote === "string") return p.pairingNote;
  if (Array.isArray(p.pairing) && p.pairing.length > 0) return p.pairing.join("\n");
  return "";
}

function specRows(p) {
  const rows = [["Volume", `${p.volumeMl}ml`]];
  if (p.rice) rows.push(["Rice", p.rice]);
  if (p.kakemai) rows.push(["Kakemai", p.kakemai]);
  if (p.kojimai) rows.push(["Kojimai", p.kojimai]);
  if (p.yeast) rows.push(["Yeast", p.yeast]);
  if (p.polish !== "" && p.polish != null) rows.push(["Polish ratio", `${p.polish}%`]);
  if (p.abv !== "" && p.abv != null) rows.push(["Alcohol", `${p.abv}%`]);
  if (p.smv !== "" && p.smv != null) rows.push(["Sake meter value", fmtSigned(p.smv)]);
  if (p.acidity !== "" && p.acidity != null) rows.push(["Acidity", Number(p.acidity).toFixed(1)]);
  return rows;
}

// 1商品ぶんのカード。画面のカードと同じ並びで組む。
function cardHtml(p) {
  const inner = p.photoFront
    ? `<img src="${p.photoFront}" style="width:100%;display:block;border-bottom:1px solid #e5e3de">`
    : `<div style="height:200px;background:#f1efea;border-bottom:1px solid #e5e3de"></div>`;
  // 張り紙は、画面と同じく写真の中央に文字だけを重ねる。
  const st = p.status === "sold" || p.status === "soon" ? p.status : (p.soldOut ? "sold" : "");
  const band = st
    ? `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 16px">
         <span style="color:#fff;text-align:center;line-height:1.2;letter-spacing:.22em;
                      text-shadow:0 1px 10px rgba(0,0,0,.35);
                      font-size:${st === "sold" ? 23 : 21}px;
                      font-family:${st === "sold" ? '"Playfair Display",serif' : '"Cormorant Garamond",serif'}">
           ${st === "sold" ? "SOLD OUT" : "COMING SOON!"}
         </span>
         <span style="display:block;width:28px;height:1px;background:rgba(255,255,255,.8);margin-top:10px"></span>
       </div>`
    : "";
  const photo = `<div style="position:relative;overflow:hidden">${inner}${band}</div>`;
  const specs = specRows(p)
    .map(([k, v]) => `<div style="color:#8c8880">${esc(k)}</div><div style="text-align:right">${esc(v)}</div>`)
    .join("");
  const brewery = p.brewery ? `<p style="font-size:11px;color:#8c8880;margin:12px 0 0">${esc(p.brewery)}</p>` : "";
  const tax = Math.floor((Number(p.retailPrice) || 0) * 1.1);
  const pairing = pairingTextOf(p).trim();
  const pairingBlock = pairing
    ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e3de">
         <div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#8c8880">Pairing</div>
         <div style="font-size:12px;margin-top:6px;white-space:pre-wrap">${esc(pairing)}</div>
       </div>`
    : "";
  return `
  <article style="background:#fff;border:1px solid #e5e3de;margin:0;padding:16px">
    <div style="margin:-16px -16px 16px">${photo}</div>
    <p style="font-size:17px;font-weight:600;margin:0">${esc(p.name)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-top:12px;font-size:11px;font-family:ui-monospace,monospace">${specs}</div>
    ${brewery}
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e5e3de;display:flex;justify-content:space-between;font-size:11px">
      <span style="color:#8c8880">Retail</span>
      <span style="font-family:ui-monospace,monospace">${fmtYen(p.retailPrice)}<span style="color:#8c8880"> （税込 ${fmtYen(tax)}）</span></span>
    </div>
    ${pairingBlock}
  </article>`;
}

// 画面外に、アプリと同じ幅で組んでから画像にする。印刷用に作り直さないので
// 文字の大きさも写真の比率も画面のまま残る。
function buildStage(products, widthPx) {
  const stage = document.createElement("div");
  stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;background:#faf9f7;padding:0;` +
    `font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:#2b2926`;
  stage.innerHTML = products.map(cardHtml).join("");
  document.body.appendChild(stage);
  return stage;
}

export async function shareCatalogPdf(products) {
  const list = (products || []).filter((p) => p && p.name);
  if (list.length === 0) throw new Error("No products");

  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  const contentW = PAGE_W - MARGIN * 2;
  const scale = 2; // 文字と写真が粗くならない倍率
  // アプリの画面と同じ幅で組む。縮めないので、文字も写真も画面のままの大きさになる。
  const stage = buildStage(list, Math.round(contentW / PT_PER_PX));

  try {
    // 写真(dataURL)の読み込み待ち。待たずに描くと写真が抜ける。
    await Promise.all(
      Array.from(stage.querySelectorAll("img")).map(
        (img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; })
      )
    );

    // カードごとに1ページ。ページの高さはそのカードの高さに合わせるので、
    // 写真が縦長の商品でも切れず、余白も出ない。
    let pdf = null;
    for (const card of Array.from(stage.children)) {
      const canvas = await html2canvas(card, { scale, backgroundColor: "#faf9f7", useCORS: true, logging: false });
      const h = canvas.width ? (canvas.height / canvas.width) * contentW : 0;
      const pageH = h + MARGIN * 2;
      if (!pdf) pdf = new jsPDF({ unit: "pt", format: [PAGE_W, pageH] });
      else pdf.addPage([PAGE_W, pageH]);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN, MARGIN, contentW, h);
    }

    const blob = pdf.output("blob");
    const name = `ByMaeNikko_catalog_${new Date().toISOString().slice(0, 10)}.pdf`;
    const file = new File([blob], name, { type: "application/pdf" });

    // iPhoneは共有シートからメール・LINEへそのまま渡せる。使えない環境では
    // 新しいタブで開き、そこから保存してもらう。
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "ByMaeNikko" }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } finally {
    stage.remove();
  }
}
