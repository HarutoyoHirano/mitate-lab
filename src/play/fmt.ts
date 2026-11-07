/**
 * 判定の幅とくらべて言う数字は、丸めたあとでも判定と食い違わない桁で出す（2026-11-07、外部の模擬評価76
 * 「表示上同じでも内部だけ不合格にしない」による。例：ちがい 0.0304 を「0.030 は 0.03 より大きい」と書かない）
 */
export function fmtVs(d: number, tol: number, digits: number, over: boolean): string {
  let k = digits;
  while (k < 8 && (over ? +d.toFixed(k) <= tol : +d.toFixed(k) > tol)) k++;
  return d.toFixed(k);
}
