// 幾何計算（純粋関数）。単位はm。
// 出典：通常版 §3.1, p.35–36「ボッチャコートレイアウト」「使用テープおよび計測ガイドライン」／フレンドリー版 p.13–14
//
// 境界の扱い：
// - 外枠ラインは内側の縁を基準に計測する（通常版 §3.1）。外周ラインに接触した球はアウト（通常版 §10.10.1）。
//   → 球の円がプレイングエリア [0,width]×[0,playingLength] の内部に完全に収まる場合のみエリア内とする。
// - スローイングライン・Vラインはジャック無効エリア内に貼る（通常版 §3.1）。
//   10mラインは「スローイングラインのボックス側」、Vラインの3m・1.5mは「Vラインのクロス側（有効側の縁）」まで。
//   → V座標は有効側の縁。ジャックは円全体が縁より有効側にあるときのみ「完全に越えた」とみなす。
// - 線幅は描画用属性で、判定には使わない。

import type { Ball, CourtConfig, Vec } from './types';
import { EPS_EQUAL } from './numeric';

/** 公称円周270mm（通常版 §5／フレンドリー版 §5.1）から算出した半径。描画・簡易測定の初期近似値。 */
export const BALL_CIRCUMFERENCE = 0.27;
export const BALL_RADIUS = BALL_CIRCUMFERENCE / (2 * Math.PI); // ≒ 0.04297m

export const DEFAULT_COURT: CourtConfig = {
  width: 6.0,
  length: 12.5,
  playingLength: 10.0,
  boxCount: 6,
  cross: { x: 3.0, y: 5.0 },
  vLeft: { x: 0.0, y: 7.0 },
  vApex: { x: 3.0, y: 8.5 },
  vRight: { x: 6.0, y: 7.0 },
  targetBoxSize: 0.35,
  thickLine: 0.04,
  thinLine: 0.02,
  custom: false,
  customNote: '',
};

export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 点pから線分abへの最短距離と最近点 */
export function closestPointOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; dist: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, dist: distance(p, point), t };
}

/** Vライン（有効側の縁）の x における y 座標 */
export function vLineY(court: CourtConfig, x: number): number {
  const { vLeft, vApex, vRight } = court;
  if (x <= vApex.x) {
    const span = vApex.x - vLeft.x;
    const t = span === 0 ? 0 : (x - vLeft.x) / span;
    return vLeft.y + t * (vApex.y - vLeft.y);
  }
  const span = vRight.x - vApex.x;
  const t = span === 0 ? 0 : (x - vApex.x) / span;
  return vApex.y + t * (vRight.y - vApex.y);
}

/** 円がプレイングエリア内に完全に収まっているか（外周の縁に接触した場合は収まっていない＝アウト） */
export function isCircleInPlayingArea(c: Vec, r: number, court: CourtConfig): boolean {
  return (
    c.x - r > EPS_EQUAL &&
    c.x + r < court.width - EPS_EQUAL &&
    c.y - r > EPS_EQUAL &&
    c.y + r < court.playingLength - EPS_EQUAL
  );
}

/** Vライン折れ線までの最短距離 */
export function distanceToVLine(c: Vec, court: CourtConfig): number {
  return Math.min(
    closestPointOnSegment(c, court.vLeft, court.vApex).dist,
    closestPointOnSegment(c, court.vApex, court.vRight).dist,
  );
}

/** 円の中心がVラインより有効側（クロス側）にあるか */
export function isCenterOnValidSideOfV(c: Vec, court: CourtConfig): boolean {
  return c.y < vLineY(court, c.x);
}

export type JackAreaStatus = 'valid' | 'touchingV' | 'invalidArea' | 'outOfPlayingArea';

/**
 * ジャック有効エリア判定（中心点だけでなく円と境界の位置関係で判定）。
 * - outOfPlayingArea: 円がプレイングエリアに完全には収まっていない（外周ライン接触・越え）
 * - invalidArea: 中心がジャック無効エリア側
 * - touchingV: 中心は有効側だがVラインの縁に円がかかっている（完全に越えていない）
 */
export function jackAreaStatus(c: Vec, r: number, court: CourtConfig): JackAreaStatus {
  if (!isCircleInPlayingArea(c, r, court)) return 'outOfPlayingArea';
  if (!isCenterOnValidSideOfV(c, court)) return 'invalidArea';
  if (distanceToVLine(c, court) <= r + EPS_EQUAL) return 'touchingV';
  return 'valid';
}

export const JACK_AREA_LABEL: Record<JackAreaStatus, string> = {
  valid: 'ジャック有効エリア内',
  touchingV: 'Vラインにかかっている（完全に越えていない）',
  invalidArea: 'ジャック無効エリア内',
  outOfPlayingArea: 'プレイングエリア外／外周ラインに接触',
};

/** 2球の円が重なっているか（2D表示上） */
export function circlesOverlap(a: Vec & { radius: number }, b: Vec & { radius: number }): boolean {
  return distance(a, b) < a.radius + b.radius - 1e-6;
}

/** コート上にある（未投球でない）球 */
export const isOnCourt = (b: Ball): boolean => b.status !== 'available';

/** 2D表示上で重なっている球のペア一覧（コート上のプレイ中の球のみ） */
export function findOverlaps(balls: Ball[]): Array<[string, string]> {
  const on = balls.filter((b) => b.status === 'inPlay');
  const res: Array<[string, string]> = [];
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      if (circlesOverlap(on[i], on[j])) res.push([on[i].id, on[j].id]);
    }
  }
  return res;
}

/**
 * 重なり回避：位置pの円（半径r）が他の円と重ならないよう、重なった相手から中心線方向へ押し出して接触位置にスナップする。
 * 数回反復して解消できなければ最後の位置を返す。
 */
export function resolveOverlap(p: Vec, r: number, others: Array<Vec & { radius: number }>, iterations = 12): Vec {
  let cur = { ...p };
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const o of others) {
      const d = distance(cur, o);
      const min = r + o.radius;
      if (d < min - 1e-6) {
        let ux: number;
        let uy: number;
        if (d < 1e-9) {
          ux = 0;
          uy = -1;
        } else {
          ux = (cur.x - o.x) / d;
          uy = (cur.y - o.y) / d;
        }
        cur = { x: o.x + ux * min, y: o.y + uy * min };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return cur;
}

/** スローイングボックス番号（1〜6）の中心座標 */
export function boxCenter(court: CourtConfig, box: number): Vec {
  const bw = court.width / court.boxCount;
  return { x: (box - 0.5) * bw, y: (court.playingLength + court.length) / 2 };
}

/** 座標がどのスローイングボックス内か（なければ null） */
export function boxAt(court: CourtConfig, p: Vec): number | null {
  if (p.y < court.playingLength || p.y > court.length || p.x < 0 || p.x > court.width) return null;
  const bw = court.width / court.boxCount;
  return Math.min(court.boxCount, Math.max(1, Math.floor(p.x / bw) + 1));
}

/** 矢印の角度：真正面（-y方向）を0°として右を正とした角度（度） */
export function arrowAngleDeg(from: Vec, to: Vec): number {
  return (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
}

/**
 * 直線経路上の接触候補：始点から終点へ半径rの球が直進すると仮定し、中心間距離が r + 相手半径 以下になる球。
 * 上から越える投球、曲がり、弾き、変形は計算しない。
 */
export function contactCandidates(from: Vec, to: Vec, r: number, balls: Ball[]): Array<{ ballId: string; t: number }> {
  const res: Array<{ ballId: string; t: number }> = [];
  for (const b of balls) {
    if (b.status !== 'inPlay') continue;
    const { dist, t } = closestPointOnSegment(b, from, to);
    if (dist <= r + b.radius + EPS_EQUAL) res.push({ ballId: b.id, t });
  }
  return res.sort((a, b) => a.t - b.t);
}

export type JackResetResult =
  | { kind: 'cross'; position: Vec }
  | { kind: 'frontOfCross'; position: Vec }
  | { kind: 'manual'; position: Vec; reason: string };

/**
 * ジャックのクロス再配置位置（通常版 §10.11.1–10.11.2）。
 * クロスに球があって置けない場合、クロスの前面（クロスとスローイングラインの間）でできるだけ近く、
 * 左右サイドラインから等距離（x=中央）に置く。機械的に置けない場合は manual。
 * occupiedCrossRule='manual' のプロファイル（フレンドリー版）では、クロスが塞がっていれば手動確定とする。
 */
export function jackResetPosition(
  court: CourtConfig,
  balls: Ball[],
  jackRadius: number,
  occupiedCrossRule: 'frontOfCross' | 'manual',
): JackResetResult {
  const others = balls.filter((b) => b.kind === 'color' && b.status === 'inPlay');
  const free = (p: Vec) => others.every((o) => distance(p, o) >= jackRadius + o.radius - 1e-9);
  if (free(court.cross)) return { kind: 'cross', position: { ...court.cross } };
  if (occupiedCrossRule === 'manual') {
    return {
      kind: 'manual',
      position: { ...court.cross },
      reason: 'クロス上に球があります。この規則版には置き直し位置の明示がないため、主催者・審判の判断で位置を確定してください。',
    };
  }
  const x = court.width / 2;
  const step = 0.0005; // 0.5mm刻みで探索
  for (let y = court.cross.y; y < court.playingLength; y += step) {
    const p = { x, y };
    if (free(p)) {
      if (jackAreaStatus(p, jackRadius, court) !== 'valid') break;
      return { kind: 'frontOfCross', position: p };
    }
  }
  return {
    kind: 'manual',
    position: { ...court.cross },
    reason: 'クロス前面の中央に置ける位置が見つかりません。審判の判断で位置を手動確定してください。',
  };
}
