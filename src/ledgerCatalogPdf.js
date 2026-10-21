/**
 * Now on sale の商品一覧を、アプリの画面と同じ見た目のPDFにして共有する。
 *
 * 日本語を含むPDFは、文字の形をPDFに埋め込まないと化ける。フォントを丸ごと
 * 積むとアプリが重くなるため、画面をそのまま画像にしてPDFに貼る方式にした。
 * 端末の文字で描かれるので化けず、見た目も画面と揃う。
 */

const PAGE_W = 595.28; // A4(pt)
const PAGE_H = 841.89;
const MARGIN = 28;

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
  // 売り切れの帯は、画面と同じく写真の上に斜めに重ねる。
  const band = p.soldOut
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
         <div style="width:160%;transform:rotate(-14deg);background:rgba(192,57,43,.9);color:#fff;
                     text-align:center;padding:10px 0;font-weight:600;letter-spacing:.3em;font-size:14px">SOLD OUT</div>
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
  <article style="background:#fff;border:1px solid #e5e3de;margin:0 0 20px;padding:16px">
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

// 画面外に実物の大きさで組んでから画像にする。印刷用に作り直すのではなく
// 同じ見た目を保つため、カード1枚ずつ測って、ページ跨ぎで切れないようにする。
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
  const scale = 2;              // 文字と写真が粗くならない倍率
  const widthPx = Math.round(contentW * 2); // 組み立て時の実寸(px)
  const stage = buildStage(list, widthPx);

  try {
    // 写真(dataURL)の読み込み待ち。待たずに描くと写真が抜ける。
    await Promise.all(
      Array.from(stage.querySelectorAll("img")).map(
        (img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; })
      )
    );

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    let y = MARGIN;
    let first = true;

    for (const card of Array.from(stage.children)) {
      const canvas = await html2canvas(card, { scale, backgroundColor: null, useCORS: true, logging: false });
      const h = (canvas.width ? (canvas.height / canvas.width) * contentW : 0);
      // 1枚がページに収まらないときは、そのカードだけページいっぱいに縮める。
      const fitH = Math.min(h, PAGE_H - MARGIN * 2);
      const fitW = h > 0 ? (contentW * fitH) / h : contentW;

      if (!first && y + fitH > PAGE_H - MARGIN) { pdf.addPage(); y = MARGIN; }
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", MARGIN, y, fitW, fitH);
      y += fitH + 14;
      first = false;
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
