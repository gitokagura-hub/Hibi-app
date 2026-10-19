import { Hammer, BookOpen } from "lucide-react";
import BottomNavigation from "./BottomNavigation";

/**
 * WA NO KATA の下部ナビゲーション。Daily Brains の BottomNavigation をそのまま使い、中身だけ差し替える。
 *   WA NO KATA … 作り手(仕事の相手)の一覧
 *   Sukima     … 企業・人物の研究
 */
const ITEMS = [
  { id: "wanokata", label: "WA NO KATA", icon: Hammer },
  { id: "sukima", label: "Sukima", icon: BookOpen },
];

export default function WaNoKataBottomNav({ current, setTab }) {
  return <BottomNavigation current={current} setTab={setTab} items={ITEMS} />;
}
