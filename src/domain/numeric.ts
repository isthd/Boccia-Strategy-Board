// 浮動小数点比較の共通ユーティリティ。単位はm。

/** 座標計算の丸め誤差を吸収する「完全一致」許容値（1ナノメートル）。公式判定の閾値ではない。 */
export const EPS_EQUAL = 1e-9;

/** この差未満の距離差は「近接・要計測」として警告する（1mm）。公式の同距離判定には使わない。 */
export const NEAR_THRESHOLD = 0.001;

export const approxEqual = (a: number, b: number, eps = EPS_EQUAL): boolean => Math.abs(a - b) <= eps;
export const lessThan = (a: number, b: number, eps = EPS_EQUAL): boolean => a < b - eps;
export const greaterThan = (a: number, b: number, eps = EPS_EQUAL): boolean => a > b + eps;

/** m → cm 表示（小数1桁） */
export const fmtCm = (m: number, digits = 1): string => `${(m * 100).toFixed(digits)}cm`;
/** m 表示（小数3桁） */
export const fmtM = (m: number, digits = 3): string => `${m.toFixed(digits)}m`;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 0.1mm 単位に丸める（数値入力時の表示ぶれ防止） */
export const roundTo = (v: number, step = 0.0001): number => Math.round(v / step) * step;
