// 距離測定と暫定得点（純粋関数）
// 出典：通常版 §10.16.1–10.16.2／フレンドリー版 §8.14.1–8.14.2
// - ジャックに一番近いボールのサイドに、相手サイドの最も近い球よりジャックに近い球1球につき1点。
// - 異なる色の球が最も近い距離で等距離なら、該当球それぞれに1点。
// - 片側に有効球がなければ反対側の有効球すべてが得点。両側になければ0–0。
// 距離モデル：球を半径一定の円と近似。順位は「表面間の推定距離 = 中心間距離 − ジャック半径 − 球半径」で決める
// （全球が同半径なら中心間距離の順位と一致する）。

import type { Ball, CourtConfig, Side, TieResolution } from './types';
import { otherSide } from './types';
import { distance, isCircleInPlayingArea } from './geometry';
import { EPS_EQUAL, NEAR_THRESHOLD } from './numeric';

export interface RankedBall {
  ballId: string;
  side: Side;
  number: number;
  /** 中心間距離 (m) */
  centerDistance: number;
  /** 表面間の推定距離 (m)。順位判定キー */
  surfaceDistance: number;
  scoring: boolean;
}

export type ScoreRelation = 'noJack' | 'none' | 'onlyRed' | 'onlyBlue' | 'red' | 'blue' | 'equal';

export interface ScoreResult {
  relation: ScoreRelation;
  red: number;
  blue: number;
  /** 暫定リード側（同点・0–0は null） */
  leader: Side | null;
  ranking: RankedBall[];
  scoringBallIds: string[];
  nearestRed: RankedBall | null;
  nearestBlue: RankedBall | null;
  /** 赤青の最寄り球の距離差が1mm未満だが完全同距離ではない（近接・要計測） */
  nearTie: boolean;
  /** 得点に数えるかどうかの境界付近（1mm未満）にある球 */
  boundaryBallIds: string[];
  /** 手動補正が適用されたか */
  resolutionApplied: TieResolution;
  /** 判定から除外した球（アウト扱い・位置がエリア外）の注記 */
  excluded: Array<{ ballId: string; reason: string }>;
  jackOnCourt: boolean;
  jackInPlayingArea: boolean;
}

/** 得点対象の有効なカラー球か（状態がプレイ中、かつ位置がプレイングエリア内） */
export function isScoringEligible(b: Ball, court: CourtConfig): boolean {
  return b.kind === 'color' && b.status === 'inPlay' && isCircleInPlayingArea(b, b.radius, court);
}

export function findJack(balls: Ball[]): Ball | undefined {
  return balls.find((b) => b.kind === 'jack');
}

export function computeScore(balls: Ball[], court: CourtConfig, tieResolution: TieResolution = 'auto'): ScoreResult {
  const jack = findJack(balls);
  const excluded: ScoreResult['excluded'] = [];
  const empty = (relation: ScoreRelation, jackOnCourt: boolean, jackInPlayingArea: boolean): ScoreResult => ({
    relation,
    red: 0,
    blue: 0,
    leader: null,
    ranking: [],
    scoringBallIds: [],
    nearestRed: null,
    nearestBlue: null,
    nearTie: false,
    boundaryBallIds: [],
    resolutionApplied: 'auto',
    excluded,
    jackOnCourt,
    jackInPlayingArea,
  });

  if (!jack || jack.status !== 'inPlay') return empty('noJack', false, false);
  const jackInPlayingArea = isCircleInPlayingArea(jack, jack.radius, court);

  for (const b of balls) {
    if (b.kind !== 'color' || b.status === 'available') continue;
    if (b.status !== 'inPlay') excluded.push({ ballId: b.id, reason: '状態がプレイ中ではない' });
    else if (!isCircleInPlayingArea(b, b.radius, court))
      excluded.push({ ballId: b.id, reason: '位置がプレイングエリア外／外周ラインに接触' });
  }

  const ranking: RankedBall[] = balls
    .filter((b) => isScoringEligible(b, court))
    .map((b) => {
      const cd = distance(b, jack);
      return {
        ballId: b.id,
        side: b.side as Side,
        number: b.number,
        centerDistance: cd,
        surfaceDistance: cd - jack.radius - b.radius,
        scoring: false,
      };
    })
    .sort((a, b) => a.surfaceDistance - b.surfaceDistance || a.ballId.localeCompare(b.ballId));

  const reds = ranking.filter((r) => r.side === 'red');
  const blues = ranking.filter((r) => r.side === 'blue');
  if (reds.length === 0 && blues.length === 0) return empty('none', true, jackInPlayingArea);

  const result: ScoreResult = {
    ...empty('none', true, jackInPlayingArea),
    ranking,
    nearestRed: reds[0] ?? null,
    nearestBlue: blues[0] ?? null,
  };

  const mark = (list: RankedBall[]) => {
    for (const r of list) r.scoring = true;
    return list.length;
  };

  if (blues.length === 0) {
    result.relation = 'onlyRed';
    result.red = mark(reds);
  } else if (reds.length === 0) {
    result.relation = 'onlyBlue';
    result.blue = mark(blues);
  } else {
    const dr = reds[0].surfaceDistance;
    const db = blues[0].surfaceDistance;
    const diff = Math.abs(dr - db);
    let rel: 'red' | 'blue' | 'equal';
    if (tieResolution !== 'auto') {
      rel = tieResolution;
      result.resolutionApplied = tieResolution;
    } else if (diff <= EPS_EQUAL) rel = 'equal';
    else rel = dr < db ? 'red' : 'blue';
    result.relation = rel;
    result.nearTie = tieResolution === 'auto' && diff > EPS_EQUAL && diff < NEAR_THRESHOLD;

    if (rel === 'equal') {
      result.red = mark(reds.filter((r) => Math.abs(r.surfaceDistance - dr) <= EPS_EQUAL));
      result.blue = mark(blues.filter((b) => Math.abs(b.surfaceDistance - db) <= EPS_EQUAL));
    } else {
      const winners = rel === 'red' ? reds : blues;
      const oppNearest = rel === 'red' ? db : dr;
      let closer = winners.filter((w) => w.surfaceDistance < oppNearest - EPS_EQUAL);
      // 手動補正で「優勢」とされた場合、最寄り球は少なくとも1点
      if (closer.length === 0) closer = [winners[0]];
      const pts = mark(closer);
      if (rel === 'red') result.red = pts;
      else result.blue = pts;
      // 得点境界付近（相手最寄り球との差が1mm未満）の球を警告
      for (const w of winners) {
        const d = Math.abs(w.surfaceDistance - oppNearest);
        if (d > EPS_EQUAL && d < NEAR_THRESHOLD) result.boundaryBallIds.push(w.ballId);
      }
    }
  }
  result.scoringBallIds = ranking.filter((r) => r.scoring).map((r) => r.ballId);
  result.leader = result.red > result.blue ? 'red' : result.blue > result.red ? 'blue' : null;
  return result;
}

/** 得点内訳の説明文 */
export function describeScore(s: ScoreResult): string {
  switch (s.relation) {
    case 'noJack':
      return 'ジャックがコート上にありません。';
    case 'none':
      return '両サイドとも有効なカラー球がないため 0–0。';
    case 'onlyRed':
      return '青の有効球がないため、赤の有効球すべてが得点対象。';
    case 'onlyBlue':
      return '赤の有効球がないため、青の有効球すべてが得点対象。';
    case 'equal':
      return '赤と青の最寄り球が同距離のため、同距離の球それぞれに1点。';
    case 'red':
    case 'blue': {
      const w = s.relation === 'red' ? '赤' : '青';
      const o = s.relation === 'red' ? '青' : '赤';
      return `${w}が最も近い。${o}の最寄り球よりジャックに近い${w}の球1球につき1点。`;
    }
  }
}

export const leaderOf = (s: ScoreResult): Side | null => s.leader;
export const sideOfCloser = (s: ScoreResult): Side | null =>
  s.relation === 'red' || s.relation === 'onlyRed' ? 'red' : s.relation === 'blue' || s.relation === 'onlyBlue' ? 'blue' : null;
export const farSide = (s: ScoreResult): Side | null => {
  const c = sideOfCloser(s);
  return c ? otherSide(c) : null;
};
