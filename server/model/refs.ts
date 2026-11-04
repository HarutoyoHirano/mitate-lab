// 出典カタログ（CLAUDE.md 1e-3）：実在と書誌を確かめた文献だけを置く。AIは部品ごとにこの中から出典を選ぶ。
// AIに自由に引用させない（架空の文献になりうるため）。論文タイトルは省略しない。
// 書誌は 2026-11-05 に出版社・索引の頁で確かめた（確かめた先を checkedAt に書く）。
import type { PartType } from "./partsNet.js";

export interface RefEntry {
  readonly id: string;
  /** 画面に出す書誌（題名は省略しない） */
  readonly cite: string;
  readonly doi?: string;
  readonly field: string;
  /** この文献で知られている内容（AIへの説明にも使う） */
  readonly about: string;
  /** この文献で支えられる部品の種類 */
  readonly supports: readonly PartType[];
  /** この文献が扱っていないこと */
  readonly notCovers: string;
  /** この文献を出典にした部品の「役」に使ってはいけない言葉 */
  readonly excludeWords?: RegExp;
  /** この文献の対象の言葉。部品の名前か役に、どれか一つが入っていなければならない（別の器官の文献を形だけ借りるのを防ぐ） */
  readonly topicWords: RegExp;
  readonly checkedAt: string;
}

export const REFS: readonly RefEntry[] = [
  {
    id: "westerhof2009",
    cite: "Westerhof N, Lankhaar J-W, Westerhof BE. The arterial Windkessel. Medical & Biological Engineering & Computing. 2009;47(2):131–141.",
    doi: "10.1007/s11517-008-0359-2",
    field: "血管",
    about: "太い動脈のふくらみやすさ（コンデンサ）と、その先の細い血管の流れにくさ（抵抗）の二つで動脈の圧を表す模型（2要素ウィンドケッセル）。心臓から入る血液の流れを入力にする。",
    supports: ["store", "resist", "source"],
    notCovers: "波が血管を伝わってはね返ること（この模型の限界として書かれている）。",
    topicWords: /血管|動脈|血液|心臓|脈/,
    checkedAt: "paperity.org（Springer の書誌）",
  },
  {
    id: "shi2011",
    cite: "Shi Y, Lawford P, Hose R. Review of Zero-D and 1-D Models of Blood Flow in the Cardiovascular System. BioMedical Engineering OnLine. 2011;10:33.",
    doi: "10.1186/1475-925X-10-33",
    field: "心臓と血管",
    about: "心臓と血管を部品でつなぐ模型の総説。心臓の部屋は固さが時間で変わる部品（時間とともに変わる弾性）、弁は一方通行の戸（ダイオード）と流れにくさ、血管はふくらみやすさと流れにくさ（ウィンドケッセル）で表す。",
    supports: ["chamber", "valve", "store", "resist", "source"],
    notCovers: "弁の開き閉じの細かい動き（ダイオードは理想化と書かれている）。心臓の筋肉の中のしくみ。",
    topicWords: /心臓|血管|血液|弁|部屋|心室|心房|動脈|静脈|脈/,
    checkedAt: "PubMed Central PMC3103466",
  },
  {
    id: "suga1973",
    cite: "Suga H, Sagawa K, Shoukas AA. Load Independence of the Instantaneous Pressure-Volume Ratio of the Canine Left Ventricle and Effects of Epinephrine and Heart Rate on the Ratio. Circulation Research. 1973;32(3):314–322.",
    doi: "10.1161/01.res.32.3.314",
    field: "心臓",
    about: "心臓の下の部屋（左心室）の圧と血液の量の比（固さ）は、1回の脈の中で時間とともに上がって下がり、その動きは送り出す先の条件によらない（時間とともに変わる弾性）。",
    supports: ["chamber"],
    notCovers: "弁と血管（部屋だけを扱う）。",
    topicWords: /心臓|心室|部屋/,
    checkedAt: "scilit（Circulation Research の書誌）・synapsesocial",
  },
  {
    id: "hodgkin1946",
    cite: "Hodgkin AL, Rushton WAH. The electrical constants of a crustacean nerve fibre. Proceedings of the Royal Society of London. Series B: Biological Sciences. 1946;133(873):444–479.",
    doi: "10.1098/rspb.1946.0024",
    field: "神経の膜",
    about: "神経の膜は、電気をためる部品（膜の容量）と、イオンの通り道の抵抗で表せる（受け身の膜の電気の定数）。外から電流を入れて膜の電圧の変化を測る。",
    supports: ["store", "resist", "source"],
    notCovers: "信号がはね上がって伝わるしくみ（受け身の膜だけ）。",
    excludeWords: /はね上が|跳ね上が/,
    topicWords: /膜|神経|電流|電気|イオン/,
    checkedAt: "scilit・Royal Society の記録（makingscience）",
  },
  {
    id: "bates2009",
    cite: "Bates JHT. Lung Mechanics: An Inverse Modeling Approach. Cambridge University Press; 2009. Chapter 3: The linear single-compartment model, pp. 37–61.",
    doi: "10.1017/CBO9780511627156.004",
    field: "肺",
    about: "肺を、ふくらむ風船（ふくらみやすさ）と、そこへつながる管（空気の通り道の流れにくさ）一組で表す模型（線形の一部屋模型）。空気は管を通って風船に入り、出ていく。",
    supports: ["store", "resist", "source"],
    notCovers: "酸素と二酸化炭素の交換。肺の場所による違い（一部屋だけ）。",
    topicWords: /肺|空気|息|呼吸|気道/,
    checkedAt: "Cambridge Core の章の頁",
  },
  {
    id: "deen1972",
    cite: "Deen WM, Robertson CR, Brenner BM. A model of glomerular ultrafiltration in the rat. American Journal of Physiology. 1972;223(5):1178–1183.",
    doi: "10.1152/ajplegacy.1972.223.5.1178",
    field: "腎臓",
    about: "腎臓の糸球体で、血管の中と外の圧の差によって液がこし出される模型（こし出される量は、通りやすさ×圧の差）。",
    supports: ["resist"],
    notCovers: "こし出した液から、必要なものを選んで血液へ取りもどすしくみ（この文献は糸球体のろ過だけ）。",
    excludeWords: /取りもど|取り戻|再吸収|もどす|戻す/,
    topicWords: /糸球体|こし|ろ過|腎臓/,
    checkedAt: "scilit・JCI の文献ページ",
  },
  {
    id: "gagge1971",
    cite: "Gagge AP, Stolwijk JAJ, Nishi Y. An effective temperature scale based on a simple model of human physiological regulatory response. ASHRAE Transactions. 1971;77(1).",
    field: "体温",
    about: "体を、熱をためる体の中心と皮ふの二つの場所で表し、その間と、皮ふとまわりの空気の間を熱が流れる模型（二つの場所の模型）。体の中で生まれる熱を入力にする。",
    supports: ["store", "resist", "source"],
    notCovers: "汗や皮ふの血流が温度に合わせて変わる調節を、この謎の部品では表さない（文献の模型には調節が入っている）。",
    topicWords: /熱|体温|温度|皮ふ|皮膚/,
    checkedAt: "AIVC の文献（引用文献の一覧）。ページ番号は未確認のため書かない",
  },
];

export function refById(id: string | undefined): RefEntry | undefined {
  return REFS.find((r) => r.id === id);
}

/** 指示文に入れるカタログの説明 */
export function refCatalogText(): string {
  return REFS.map((r) => `- ${r.id}（${r.field}）：${r.about} 支える部品：${r.supports.join("・")}。扱っていないこと：${r.notCovers}`).join("\n");
}
