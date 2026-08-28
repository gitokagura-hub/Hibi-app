import { useMemo, useState } from "react";
import AcidityWheel from "./AcidityWheel";
import { compressPhoto } from "../ledgerStore";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { useLedger, monthKey, sumQty, sumAmount, toLiters } from "../ledgerStore";
import TimelessBottomNav from "./TimelessBottomNav";

/**
 * Ledger（酒類台帳）。承認済みのモック(ledger-mock.html)のレイアウトをそのまま実装する。
 *
 *   Now on sale … 商品カタログ。写真・スペック・ペアリング・ラベル/規格書
 *   Purchasing  … 仕入の記録。画面内で Purchasing / Stock を切り替える
 *   Sale        … 販売の記録
 *   Total       … 銘柄ごと・総合の集計、実地棚卸との差
 *
 * 定価(retail)と卸価格(wholesale)は小林醸造との取り決めで固定のため、
 * 商品マスタでのみ編集し、仕入・販売の個々の行では変更させない。
 */

// ペアリングは以前 pairing(配列) で持っていたため、古いデータも読めるようにする。
// 新しく打った内容は pairingNote(文字列)に入る。
function pairingTextOf(p) {
  if (typeof p.pairingNote === "string") return p.pairingNote;
  if (Array.isArray(p.pairing) && p.pairing.length > 0) return p.pairing.join("\n");
  return "";
}

// 日本酒度は符号込みで読む数値なので、プラスにも符号を付けて出す。
function fmtSigned(n) {
  const v = Number(n);
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

function fmtYen(n) {
  return `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
}
function fmtDate(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${day} ${MONTHS[Number(m) - 1]}`;
}

function useMonthCursor() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const shift = (delta) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const label = (() => {
    const [y, m] = month.split("-").map(Number);
    const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${y} · ${MONTHS[m - 1]}`;
  })();
  return { month, label, prev: () => shift(-1), next: () => shift(1) };
}

// ===== 入力シート(仕入・販売の1行を追加する) =====
// 単価は商品マスタで固定しているため、ここでは打たない。金額は 本数×単価 で
// 自動的に出す。端数値引きなどで額が変わるときだけ、手で上書きできる。
function EntrySheet({ title, onCancel, onSave, showCustomer, unitPrice, unitLabel }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const [overriding, setOverriding] = useState(false);
  const unit = Number(unitPrice) || 0;
  const q = Number(qty) || 0;
  const auto = unit * q;
  // 上書き中は打った額を、それ以外は自動計算の額を使う
  const effective = overriding ? Number(amount) || 0 : auto;
  // 販売先。小売は住所・氏名を省略できるが、卸は記帳が要る。切替は設けず、
  // 常に欄を出して任意入力にする(小売のときは空のままでよい)。
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={onCancel}>
      <div className="w-full bg-app-bg rounded-t-2xl p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold mb-3">{title}</p>
        <div className="space-y-2.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface"
          />
          <input
            type="number"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Bottles"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface"
          />
          {/* 単価 × 本数 = 金額。保存前にここで確かめられるようにする。 */}
          <div className="rounded-xl border border-app-line px-3 py-2.5 bg-app-surface">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] tracking-[0.12em] uppercase text-ink-sub">{unitLabel}</span>
              <span className="font-mono text-sm">{fmtYen(unit)}</span>
            </div>
            <div className="flex justify-between items-baseline mt-2 pt-2 border-t border-app-line">
              <span className="font-mono text-[12.5px] text-ink-sub">
                {fmtYen(unit)} × {q || 0}
              </span>
              <span className="font-mono text-base font-semibold">{fmtYen(effective)}</span>
            </div>
            {overriding ? (
              <input
                autoFocus
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (¥)"
                className="w-full mt-2 rounded-lg border border-app-line px-2.5 py-1.5 text-sm bg-app-bg"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setOverriding(true); setAmount(String(auto || "")); }}
                className="text-[11px] text-ink-sub mt-2"
              >
                Edit amount
              </button>
            )}
          </div>
          {showCustomer && (
            <>
              <input
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Customer (optional)"
                className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface"
              />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Address (optional)"
                className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface"
              />
            </>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-app-line py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!date || !q) return;
              onSave({
                date, qty: q, amount: effective, unitPrice: unit,
                ...(showCustomer ? { customer: customer.trim(), address: address.trim() } : {}),
              });
            }}
            className="flex-1 rounded-xl bg-ink text-app-bg py-2.5 text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 商品の追加・編集シート =====
// product を渡すと編集モードになり、既存の値が入った状態で開く。
// 規格書(spec sheet)は名前だけを控える。ファイル本体はこの画面では扱わず、
// あとでGoogle Driveと連携させる前提の器として置いている。
function ProductSheet({ product, onCancel, onSave, onDelete }) {
  const isEdit = Boolean(product);
  const [name, setName] = useState(product?.name || "");
  const [volumeMl, setVolumeMl] = useState(String(product?.volumeMl ?? "720"));
  const [abv, setAbv] = useState(product?.abv ?? "");
  const [brewery, setBrewery] = useState(product?.brewery || "");
  // 米・掛米・酵母・精米歩合・日本酒度・酸度は一律の欄として持つ(米や麹米以外の掛米が
  // 使われる場合もあるため両方持たせる)
  const [rice, setRice] = useState(product?.rice || "");
  const [kakemai, setKakemai] = useState(product?.kakemai || "");
  const [kojimai, setKojimai] = useState(product?.kojimai || "");
  const [yeast, setYeast] = useState(product?.yeast || "");
  const [polish, setPolish] = useState(product?.polish ?? "");
  const [smv, setSmv] = useState(product?.smv ?? "");
  const [smvWheelOpen, setSmvWheelOpen] = useState(false);
  const [acidity, setAcidity] = useState(product?.acidity ?? "");
  const [acidityWheelOpen, setAcidityWheelOpen] = useState(false);
  const [retailPrice, setRetailPrice] = useState(String(product?.retailPrice ?? ""));
  const [wholesalePrice, setWholesalePrice] = useState(String(product?.wholesalePrice ?? ""));
  const [docs, setDocs] = useState(product?.docs || []);
  const [photoFront, setPhotoFront] = useState(product?.photoFront || null);
  const [photoBack, setPhotoBack] = useState(product?.photoBack || null);
  const [docInput, setDocInput] = useState("");

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end" onClick={onCancel}>
      <div className="w-full bg-app-bg rounded-t-2xl p-5 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold mb-3">{isEdit ? "Edit product" : "Add product"}</p>
        {/* ラベル写真。表・裏を縦に続けて置く。撮影/選択のみで、Driveへは送らず
            この端末の中に保存する。 */}
        <div className="space-y-2 mb-3">
          {[["Front", photoFront, setPhotoFront], ["Back", photoBack, setPhotoBack]].map(([label, val, setter]) => (
            <label key={label} className="block relative h-64 bg-app-raised border border-app-line overflow-hidden cursor-pointer">
              {val ? (
                <img src={val} alt={label} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] tracking-[0.2em] text-ink-sub/60">
                  LABEL — {label.toUpperCase()}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setter(await compressPhoto(file));
                }}
              />
              {val && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setter(null); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                >×</button>
              )}
            </label>
          ))}
        </div>

        <div className="space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={volumeMl} onChange={(e) => setVolumeMl(e.target.value)} inputMode="numeric" placeholder="Volume (ml)"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={brewery} onChange={(e) => setBrewery(e.target.value)} placeholder="Brewery"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />

          {/* 規格は 米 → 掛米 → 麹米 → 酵母 → 精米歩合 → アルコール → 日本酒度 → 酸度 の順で並べる */}
          <input value={rice} onChange={(e) => setRice(e.target.value)} placeholder="Rice"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={kakemai} onChange={(e) => setKakemai(e.target.value)} placeholder="Kakemai"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={kojimai} onChange={(e) => setKojimai(e.target.value)} placeholder="Kojimai"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={yeast} onChange={(e) => setYeast(e.target.value)} placeholder="Yeast"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={polish} onChange={(e) => setPolish(e.target.value)} inputMode="numeric" placeholder="Polish ratio (%)"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={abv} onChange={(e) => setAbv(e.target.value)} inputMode="numeric" placeholder="Alcohol (%)"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />

          {/* 日本酒度と酸度は数値入力ではなく、時刻と同じ仕組みのホイールで選ぶ。
              上に大きい数、下に小さい数という並びで、指で下に払うと
              プラス側が出てくる動き。値域は項目ごとに違う。
                日本酒度 … -20.0〜20.0(0を中心に甘辛を表す)
                酸度     … 0.0〜3.0(マイナスは存在しない) */}
          <button
            type="button"
            onClick={() => setSmvWheelOpen(true)}
            className="flex items-center justify-between rounded-xl border border-app-line px-3 py-2.5 bg-app-surface w-full"
          >
            <span className="text-sm text-ink-sub">Sake meter value</span>
            <span className="font-mono text-sm">{smv === "" ? "Not set" : fmtSigned(smv)}</span>
          </button>
          {smvWheelOpen && (
            <AcidityWheel
              value={smv}
              onChange={setSmv}
              onClose={() => setSmvWheelOpen(false)}
              intMin={-20}
              intMax={20}
            />
          )}
          <button
            type="button"
            onClick={() => setAcidityWheelOpen(true)}
            className="flex items-center justify-between rounded-xl border border-app-line px-3 py-2.5 bg-app-surface w-full"
          >
            <span className="text-sm text-ink-sub">Acidity</span>
            <span className="font-mono text-sm">{acidity === "" ? "Not set" : Number(acidity).toFixed(1)}</span>
          </button>
          {acidityWheelOpen && (
            <AcidityWheel
              value={acidity}
              onChange={setAcidity}
              onClose={() => setAcidityWheelOpen(false)}
              intMin={0}
              intMax={3}
            />
          )}
          <input value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} inputMode="numeric" placeholder="Retail price (¥)"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
          <input value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} inputMode="numeric" placeholder="Wholesale price (¥)"
            className="w-full rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface" />
        </div>

        {/* 規格書。小林醸造から受け取った書類の名前を控えておく場所。 */}
        <div className="mt-4 pt-4 border-t border-app-line">
          <p className="text-[11px] tracking-[0.14em] uppercase text-ink-sub mb-2">Spec sheet / documents</p>
          {docs.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {docs.map((d, i) => (
                <li key={i} className="flex items-center justify-between text-sm bg-app-surface rounded-lg px-3 py-2">
                  <span className="truncate">{d}</span>
                  <button onClick={() => setDocs(docs.filter((_, x) => x !== i))} className="text-ink-sub ml-2">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={docInput}
              onChange={(e) => setDocInput(e.target.value)}
              placeholder="e.g. Spec sheet.pdf"
              className="flex-1 rounded-xl border border-app-line px-3 py-2.5 text-sm bg-app-surface"
            />
            <button
              onClick={() => { if (docInput.trim()) { setDocs([...docs, docInput.trim()]); setDocInput(""); } }}
              className="px-4 rounded-xl border border-app-line text-sm font-semibold"
            >Add</button>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {isEdit && (
            <button onClick={() => onDelete(product.id)} className="px-4 rounded-xl border border-red-200 text-red-600 text-sm font-semibold">
              Delete
            </button>
          )}
          <button onClick={onCancel} className="flex-1 rounded-xl border border-app-line py-2.5 text-sm font-semibold">Cancel</button>
          <button
            onClick={() => {
              if (!name.trim()) return;
              onSave({
                name: name.trim(),
                photoFront,
                photoBack,
                volumeMl: Number(volumeMl) || 0,
                abv: abv === "" ? "" : Number(abv),
                brewery: brewery.trim(),
                rice: rice.trim(),
                kakemai: kakemai.trim(),
                kojimai: kojimai.trim(),
                yeast: yeast.trim(),
                polish: polish === "" ? "" : Number(polish),
                smv: smv === "" ? "" : Number(smv),
                acidity: acidity === "" ? "" : Number(acidity),
                retailPrice: Number(retailPrice) || 0,
                wholesalePrice: Number(wholesalePrice) || 0,
                docs,
              });
            }}
            className="flex-1 rounded-xl bg-ink text-app-bg py-2.5 text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 1. Now on sale =====
function NowOnSale() {
  const { data, addProduct, updateProduct, deleteProduct } = useLedger();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // 編集中の商品(nullなら閉じている)

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-6 pb-2">
        <h2 className="font-serif text-sm tracking-[0.18em] uppercase text-ink-sub">Now on sale</h2>
        <button onClick={() => setAdding(true)} className="text-ink text-xl leading-none px-1">＋</button>
      </div>
      <div className="h-px bg-app-line mx-5" />

      {data.products.length === 0 && (
        <p className="text-sm text-ink-sub px-5 py-8 text-center">No products yet</p>
      )}

      {data.products.map((p) => (
        <article key={p.id} className="bg-app-surface border border-app-line mx-5 my-4 p-4 rounded-none">
          {p.photoFront ? (
            // 高さを固定せず写真の比率のまま出す。ラベルが主役の画面なので幅いっぱいに見せる。
            <img src={p.photoFront} alt={p.name} className="w-[calc(100%+32px)] h-auto -mx-4 -mt-4 mb-4 block border-b border-app-line" />
          ) : (
            <div className="h-64 -mx-4 -mt-4 mb-4 bg-app-raised border-b border-app-line flex items-center justify-center text-[10px] tracking-[0.2em] text-ink-sub/60">
              PRODUCT PHOTO
            </div>
          )}
          <button onClick={() => setEditing(p)} className="w-full text-left">
            <p className="text-lg font-semibold underline decoration-app-line underline-offset-4">{p.name}</p>
          </button>
          <div className="grid grid-cols-2 gap-y-1 mt-3 text-xs font-mono">
            <span className="text-ink-sub">Volume</span><span className="text-right">{p.volumeMl}ml</span>
            {p.rice && (<><span className="text-ink-sub">Rice</span><span className="text-right">{p.rice}</span></>)}
            {p.kakemai && (<><span className="text-ink-sub">Kakemai</span><span className="text-right">{p.kakemai}</span></>)}
            {p.kojimai && (<><span className="text-ink-sub">Kojimai</span><span className="text-right">{p.kojimai}</span></>)}
            {p.yeast && (<><span className="text-ink-sub">Yeast</span><span className="text-right">{p.yeast}</span></>)}
            {p.polish !== "" && p.polish != null && (<><span className="text-ink-sub">Polish ratio</span><span className="text-right">{p.polish}%</span></>)}
            {p.abv !== "" && p.abv != null && (<><span className="text-ink-sub">Alcohol</span><span className="text-right">{p.abv}%</span></>)}
            {p.smv !== "" && p.smv != null && (<><span className="text-ink-sub">Sake meter value</span><span className="text-right">{fmtSigned(p.smv)}</span></>)}
            {p.acidity !== "" && p.acidity != null && (<><span className="text-ink-sub">Acidity</span><span className="text-right">{Number(p.acidity).toFixed(1)}</span></>)}
          </div>
          {p.brewery && <p className="text-xs text-ink-sub mt-3">{p.brewery}</p>}

          {/* 営業用カタログなので、出すのは販売価格(定価)だけ。仕入価格は見せない。 */}
          <div className="mt-3 pt-3 border-t border-app-line">
            <div className="flex justify-between text-xs"><span className="text-ink-sub">Retail</span><span className="font-mono">{fmtYen(p.retailPrice)}</span></div>
          </div>

          {/* ペアリングは1行ずつ足す形をやめ、メモのように自由に改行して
              書ける欄にする。打った内容はそのまま保存される。 */}
          <div className="mt-3 pt-3 border-t border-app-line">
            <p className="text-[10px] tracking-[0.2em] uppercase text-ink-sub">Pairing</p>
            <textarea
              value={pairingTextOf(p)}
              onChange={(e) => updateProduct(p.id, { pairingNote: e.target.value })}
              placeholder="合う料理や飲み方を自由に書く"
              rows={3}
              className="w-full mt-2 bg-transparent text-sm outline-none resize-none placeholder:text-ink-sub/40"
            />
          </div>

          {(p.docs || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-app-line">
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-sub">Spec sheet / documents</p>
              <ul className="mt-2 space-y-0.5">
                {p.docs.map((d, i) => <li key={i} className="text-sm text-ink-sub">{d}</li>)}
              </ul>
            </div>
          )}
        </article>
      ))}

      {adding && (
        <ProductSheet
          onCancel={() => setAdding(false)}
          onSave={(v) => { addProduct(v); setAdding(false); }}
        />
      )}
      {editing && (
        <ProductSheet
          product={editing}
          onCancel={() => setEditing(null)}
          onSave={(v) => { updateProduct(editing.id, v); setEditing(null); }}
          onDelete={(id) => { deleteProduct(id); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ===== 商品ブロック(仕入・販売で共通の骨格) =====
function LedgerCard({ product, entries, month, kind, onAdd, onDelete, priceLabel, priceValue }) {
  const list = entries.filter((e) => e.productId === product.id && monthKey(e.date) === month);
  const qty = sumQty(entries, product.id, month);
  const amt = sumAmount(entries, product.id, month);
  const [adding, setAdding] = useState(false);

  return (
    <article className="bg-app-surface border border-app-line mx-5 my-4 p-4">
      <p className="text-lg font-semibold">{product.name}</p>
      <p className="text-[11px] font-mono text-ink-sub mt-1">
        {product.volumeMl}ml · {(product.volumeMl / 1000).toFixed(2)}L
      </p>

      {priceLabel && (
        <div className="flex justify-between items-baseline mt-3 pt-3 border-t border-app-line">
          <span className="text-[11px] tracking-[0.12em] uppercase text-ink-sub">{priceLabel}</span>
          <span className="font-mono text-sm">{fmtYen(priceValue)}</span>
        </div>
      )}

      <div className="mt-4 border-t border-app-line">
        {list.map((e) => (
          <div key={e.id} className="grid grid-cols-[56px_1fr_auto_28px] items-baseline gap-2 py-2.5 border-b border-app-line font-mono text-[12.5px]">
            <span className="text-ink-sub">{fmtDate(e.date)}</span>
            <span>
              {e.qty} btl
              {e.customer && (
                <span className="block text-[11px] text-ink-sub truncate">{e.customer}</span>
              )}
            </span>
            <span className="text-right">{fmtYen(e.amount)}</span>
            <button onClick={() => onDelete(e.id)} className="text-ink-sub/60"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      <button onClick={() => setAdding(true)} className="block w-full text-left text-ink text-[12.5px] py-3">＋ Add entry</button>

      <div className="flex justify-between items-baseline pt-3 border-t border-app-line">
        <span className="text-[15px] font-semibold">{qty} bottles</span>
        <span className="text-[15px] font-semibold font-mono">{fmtYen(amt)}</span>
      </div>

      {adding && (
        <EntrySheet
          title={`${kind === "purchase" ? "Add purchase" : "Add sale"} — ${product.name}`}
          showCustomer={kind === "sale"}
          unitPrice={priceValue}
          unitLabel={priceLabel}
          onCancel={() => setAdding(false)}
          onSave={(v) => { onAdd(product.id, v); setAdding(false); }}
        />
      )}
    </article>
  );
}

// ===== 2. Purchasing / Stock =====
function Purchasing() {
  const { data, addProduct, addPurchase, deletePurchase } = useLedger();
  const [seg, setSeg] = useState("pur");
  const [addingProduct, setAddingProduct] = useState(false);
  const mo = useMonthCursor();

  return (
    <div>
      <div className="flex gap-2 px-5 pt-4">
        {["pur", "stk"].map((s) => (
          <button
            key={s}
            onClick={() => setSeg(s)}
            className={`flex-1 py-2 text-[11px] tracking-[0.14em] uppercase border ${
              seg === s ? "bg-ink text-app-bg border-ink" : "border-app-line text-ink-sub"
            }`}
          >
            {s === "pur" ? "Purchasing" : "Stock"}
          </button>
        ))}
      </div>

      {seg === "pur" ? (
        <>
          <div className="flex items-center justify-center gap-6 pt-4">
            <button onClick={mo.prev} className="text-ink-sub text-lg px-3">‹</button>
            <span className="font-mono text-[13px] tracking-[0.2em]">{mo.label}</span>
            <button onClick={mo.next} className="text-ink-sub text-lg px-3">›</button>
          </div>
          <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
            <h2 className="font-serif text-sm tracking-[0.18em] uppercase text-ink-sub">Product</h2>
            <button onClick={() => setAddingProduct(true)} className="text-ink text-xl leading-none px-1">＋</button>
          </div>
          <div className="h-px bg-app-line mx-5" />

          {data.products.length === 0 && <p className="text-sm text-ink-sub px-5 py-8 text-center">No products yet</p>}
          {data.products.map((p) => (
            <LedgerCard
              key={p.id}
              product={p}
              entries={data.purchases}
              month={mo.month}
              kind="purchase"
              onAdd={addPurchase}
              onDelete={deletePurchase}
              priceLabel="Wholesale price"
              priceValue={p.wholesalePrice}
            />
          ))}
        </>
      ) : (
        <>
          <div className="px-5 pt-6 pb-2">
            <h2 className="font-serif text-sm tracking-[0.18em] uppercase text-ink-sub">Stock</h2>
          </div>
          <div className="h-px bg-app-line mx-5" />
          {data.products.map((p) => {
            const purchased = sumQty(data.purchases, p.id);
            const sold = sumQty(data.sales, p.id);
            const inStock = purchased - sold;
            return (
              <article key={p.id} className="bg-app-surface border border-app-line mx-5 my-4 p-4">
                <p className="text-lg font-semibold">{p.name}</p>
                <p className="text-[11px] font-mono text-ink-sub mt-1">
                  {p.volumeMl}ml · {(p.volumeMl / 1000).toFixed(2)}L
                </p>
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-app-line">
                  <span className="text-xs text-ink-sub">In stock</span>
                  <span className="font-serif text-3xl">{inStock}<span className="text-xs text-ink-sub font-sans ml-1.5">bottles</span></span>
                </div>
                <div className="flex gap-5 pt-3 pb-1 font-mono text-[11px] text-ink-sub">
                  <span>Purchased {purchased}</span><span>Sold {sold}</span>
                </div>
              </article>
            );
          })}
        </>
      )}

      {addingProduct && (
        <ProductSheet onCancel={() => setAddingProduct(false)} onSave={(v) => { addProduct(v); setAddingProduct(false); }} />
      )}
    </div>
  );
}

// ===== 3. Sale =====
function Sale() {
  const { data, addSale, deleteSale } = useLedger();
  const mo = useMonthCursor();
  return (
    <div>
      <div className="flex items-center justify-center gap-6 pt-6">
        <button onClick={mo.prev} className="text-ink-sub text-lg px-3">‹</button>
        <span className="font-mono text-[13px] tracking-[0.2em]">{mo.label}</span>
        <button onClick={mo.next} className="text-ink-sub text-lg px-3">›</button>
      </div>
      <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <h2 className="font-serif text-sm tracking-[0.18em] uppercase text-ink-sub">Product</h2>
      </div>
      <div className="h-px bg-app-line mx-5" />

      {data.products.length === 0 && <p className="text-sm text-ink-sub px-5 py-8 text-center">No products yet</p>}
      {data.products.map((p) => (
        <LedgerCard
          key={p.id}
          product={p}
          entries={data.sales}
          month={mo.month}
          kind="sale"
          onAdd={addSale}
          onDelete={deleteSale}
          priceLabel="Retail price"
          priceValue={p.retailPrice}
        />
      ))}
    </div>
  );
}

// ===== 4. Total =====
function Total() {
  const { data, setStockCount } = useLedger();
  const mo = useMonthCursor();
  const [editingCount, setEditingCount] = useState(null);
  const [countInput, setCountInput] = useState("");

  const grand = useMemo(() => {
    let pQty = 0, pAmt = 0, pL = 0, sQty = 0, sAmt = 0, sL = 0, stockQty = 0, stockL = 0, counted = 0, hasCounted = false;
    data.products.forEach((p) => {
      const purchased = sumQty(data.purchases, p.id);
      const sold = sumQty(data.sales, p.id);
      pQty += purchased; sQty += sold;
      pAmt += sumAmount(data.purchases, p.id);
      sAmt += sumAmount(data.sales, p.id);
      pL += toLiters(p.volumeMl, purchased);
      sL += toLiters(p.volumeMl, sold);
      const inStock = purchased - sold;
      stockQty += inStock;
      stockL += toLiters(p.volumeMl, inStock);
      const c = data.stockCounts[p.id];
      if (c && c.count !== "" && c.count != null) { counted += Number(c.count); hasCounted = true; }
    });
    return { pQty, pAmt, pL, sQty, sAmt, sL, stockQty, stockL, counted, hasCounted };
  }, [data]);

  // 同じ銘柄名の商品(720ml/1.8L等)をひとつのブロックにまとめる。
  // 並び順は商品を登録した順のまま。
  const byBrand = useMemo(() => {
    const groups = [];
    const index = new Map();
    data.products.forEach((p) => {
      const key = (p.name || "").trim();
      if (!index.has(key)) {
        index.set(key, groups.length);
        groups.push({ name: p.name, items: [], inStock: 0, stockL: 0 });
      }
      const g = groups[index.get(key)];
      g.items.push(p);
      const inStock = sumQty(data.purchases, p.id) - sumQty(data.sales, p.id);
      g.inStock += inStock;
      g.stockL += toLiters(p.volumeMl, inStock);
    });
    return groups;
  }, [data]);

  return (
    <div>
      <div className="flex items-center justify-center gap-6 pt-6">
        <button onClick={mo.prev} className="text-ink-sub text-lg px-3">‹</button>
        <span className="font-mono text-[13px] tracking-[0.2em]">{mo.label}</span>
        <button onClick={mo.next} className="text-ink-sub text-lg px-3">›</button>
      </div>

      <div className="px-5 pt-4 pb-2">
        <h2 className="font-serif text-sm tracking-[0.18em] uppercase text-ink-sub">By product</h2>
      </div>
      <div className="h-px bg-app-line mx-5" />

      {byBrand.map((g) => {
        // 銘柄を見出しにして、その中に容量別(720ml / 1.8L)の行を並べる。
        // 税務署の指導どおり、集計は銘柄×容量ごとに分けて持つ。
        const multi = g.items.length > 1;
        return (
          <article key={g.name} className="bg-app-surface border border-app-line mx-5 my-4 p-4">
            <p className="text-lg font-semibold">{g.name}</p>

            {g.items.map((p, idx) => {
              const purchased = sumQty(data.purchases, p.id);
              const sold = sumQty(data.sales, p.id);
              const inStock = purchased - sold;
              const count = data.stockCounts[p.id]?.count;
              return (
                <div key={p.id} className={idx > 0 ? "mt-5 pt-4 border-t border-app-line" : "mt-3"}>
                  <p className="text-[11px] font-mono text-ink-sub">
                    {p.volumeMl}ml · {(p.volumeMl / 1000).toFixed(2)}L
                  </p>
                  {/* 本数がまだ0でも単価は決まっているので、行の頭に出しておく。
                      左が単価、右がその単価で積み上がった金額。 */}
                  <div className="mt-2 border-t border-app-line">
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 py-2 border-b border-app-line font-mono text-[12.5px]">
                      <span className="text-ink-sub">Purchased</span>
                      <span>{purchased} btl<span className="text-ink-sub"> @ {fmtYen(p.wholesalePrice)}</span></span>
                      <span className="text-right">{fmtYen(sumAmount(data.purchases, p.id))}</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 py-2 border-b border-app-line font-mono text-[12.5px]">
                      <span className="text-ink-sub">Sold</span>
                      <span>{sold} btl<span className="text-ink-sub"> @ {fmtYen(p.retailPrice)}</span></span>
                      <span className="text-right">{fmtYen(sumAmount(data.sales, p.id))}</span>
                    </div>
                    <div className="grid grid-cols-[80px_1fr_auto] gap-2 py-2 border-b border-app-line font-mono text-[12.5px]">
                      <span className="text-ink-sub">In stock</span><span>{inStock} btl</span><span className="text-right">{toLiters(p.volumeMl, inStock).toFixed(2)} L</span>
                    </div>
                  </div>

                  {editingCount === p.id ? (
                    <div className="flex gap-2 pt-3">
                      <input
                        autoFocus type="number" inputMode="numeric"
                        value={countInput} onChange={(e) => setCountInput(e.target.value)}
                        placeholder="Bottles counted"
                        className="flex-1 rounded-lg border border-app-line px-2.5 py-1.5 text-sm bg-app-bg"
                      />
                      <button
                        onClick={() => { setStockCount(p.id, countInput === "" ? null : Number(countInput)); setEditingCount(null); }}
                        className="text-xs font-semibold px-3 rounded-lg bg-ink text-app-bg"
                      >Save</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCount(p.id); setCountInput(count ?? ""); }}
                      className="flex justify-between items-baseline w-full pt-3"
                    >
                      <span className="text-xs text-ink-sub">Inventory count</span>
                      <span className="text-sm font-semibold">
                        {count != null ? `${count} bottles` : "Not counted"}
                        {count != null && count - inStock !== 0 && (
                          <span className="text-ink-sub font-normal ml-2">({count - inStock > 0 ? "+" : ""}{count - inStock})</span>
                        )}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* 容量が2種類以上ある銘柄だけ、ブロックの下に小計を出す。
                1種類しか無いときは上の行と同じ数字になるため出さない。 */}
            {multi && (
              <div className="mt-4 pt-3 border-t border-app-line grid grid-cols-[80px_1fr_auto] gap-2 font-mono text-[12.5px]">
                <span className="text-ink-sub">Subtotal</span>
                <span>{g.inStock} btl</span>
                <span className="text-right">{g.stockL.toFixed(2)} L</span>
              </div>
            )}
          </article>
        );
      })}

      <div className="mx-5 mt-6 pt-4 border-t-2 border-ink">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-sub mb-2">Purchased</p>
        <Row k="Bottles" v={grand.pQty} />
        <Row k="Volume" v={`${grand.pL.toFixed(2)} L`} />
        <Row k="Amount" v={fmtYen(grand.pAmt)} big />
      </div>

      <div className="mx-5 mt-6 pt-4 border-t-2 border-ink">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-sub mb-2">Sold</p>
        <Row k="Bottles" v={grand.sQty} />
        <Row k="Volume" v={`${grand.sL.toFixed(2)} L`} />
        <Row k="Amount" v={fmtYen(grand.sAmt)} big />
      </div>

      <div className="mx-5 mt-6 mb-8 pt-4 border-t-2 border-ink">
        <p className="text-[10px] tracking-[0.2em] uppercase text-ink-sub mb-2">In stock</p>
        <Row k="Bottles" v={grand.stockQty} />
        <Row k="Volume" v={`${grand.stockL.toFixed(2)} L`} />
        {grand.hasCounted && (
          <>
            <Row k="Inventory count" v={grand.counted} />
            <Row k="Variance" v={grand.counted - grand.stockQty} />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, big }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-app-line last:border-b-0">
      <span className="text-xs text-ink-sub">{k}</span>
      <span className={big ? "font-serif text-2xl" : "font-mono text-[15px] font-medium"}>{v}</span>
    </div>
  );
}

// ===== 全体 =====
export default function LedgerApp({ onHome }) {
  const [tab, setTab] = useState("now");

  return (
    <div className="min-h-screen bg-app-bg relative pb-28">
      <button
        onClick={onHome}
        className="fixed bottom-24 right-5 z-30 w-11 h-11 rounded-full bg-sky-100/90 backdrop-blur border border-sky-200 flex items-center justify-center shadow-sm"
        aria-label="Homeへ戻る"
      >
        <ChevronLeft size={18} className="text-sky-700" />
      </button>

      <div className="text-center pt-8 px-5">
        <h1 className="font-serif text-[22px] tracking-[0.3em] indent-[0.3em]">LEDGER</h1>
        <div className="h-px bg-app-line mt-3.5" />
      </div>

      {tab === "now" && <NowOnSale />}
      {tab === "pur" && <Purchasing />}
      {tab === "sale" && <Sale />}
      {tab === "total" && <Total />}

      <LedgerBottomNav current={tab} setTab={setTab} />
    </div>
  );
}

function LedgerBottomNav({ current, setTab }) {
  const items = [
    { id: "now", label: "Now on sale" },
    { id: "pur", label: "Purchasing" },
    { id: "sale", label: "Sale" },
    { id: "total", label: "Total" },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-app-bg/90 backdrop-blur-xl border-t border-app-line flex items-center justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingTop: 10 }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className="flex flex-col items-center gap-1 px-2 pb-3"
        >
          <span className={`text-[9px] tracking-[0.1em] uppercase ${current === it.id ? "text-ink font-semibold" : "text-ink-sub"}`}>
            {it.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
