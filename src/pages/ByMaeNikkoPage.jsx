import { LedgerProvider } from "../ledgerStore";
import LedgerApp from "../components/LedgerApp";

/**
 * ByMaeNikko。
 *
 * 酒類事業。日本ではTimeless Analogue、ロンドンではByMaeNikko Ltd.として
 * 法人化する予定で、この画面はその事業側の入り口。
 *
 * 中身は Ledger（酒類台帳）。Now on sale / Purchasing / Sale / Total の
 * 4タブで構成される、Daily Brainsとは独立したアプリとして作っている。
 * TimelessBottomNav(Workspace/Master Pando/ByMaeNikko)は使わず、
 * Ledger自身の下部タブに置き換わる。
 */
export default function ByMaeNikkoPage({ onHome }) {
  return (
    <LedgerProvider>
      <LedgerApp onHome={onHome} />
    </LedgerProvider>
  );
}
