// まだ投げていない球（手持ち）をスローイングボックスの中に並べて見せるための配置計算（試合再現・自由配置の両方で使う）。
import type { Ball, Board, CourtConfig, MatchType, Vec } from './types';
import type { RuleProfile } from './rules/profile';

export interface HandBall extends Vec {
  ball: Ball;
  box: number;
}

/** 1列に並べる球の数と間隔(m) */
const PER_ROW = 3;
const GAP = 0.14;
/** ボックス後端から最初の列までの距離(m) */
const BACK = 0.25;

/**
 * 手持ちの球（status が available で playerBox を持つカラー球）をボックス後方に並べる。
 * jackBox を渡すと、未投球のジャックをそのボックスの列の前に置く。
 */
export function handBalls(balls: Ball[], court: CourtConfig, jackBox: number | null): HandBall[] {
  const bw = court.width / court.boxCount;
  const byBox = new Map<number, Ball[]>();
  for (const b of balls) {
    if (b.kind !== 'color' || b.status !== 'available' || b.playerBox == null) continue;
    const list = byBox.get(b.playerBox) ?? [];
    list.push(b);
    byBox.set(b.playerBox, list);
  }
  const res: HandBall[] = [];
  const rowY = (row: number) => court.length - BACK - row * GAP;
  let jackRow = 0;
  for (const [box, list] of byBox) {
    list.sort((a, b) => a.number - b.number);
    const cx = (box - 0.5) * bw;
    list.forEach((ball, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, list.length - row * PER_ROW);
      const col = i % PER_ROW;
      res.push({ ball, box, x: cx + (col - (inRow - 1) / 2) * GAP, y: rowY(row) });
    });
    if (box === jackBox) jackRow = Math.ceil(list.length / PER_ROW);
  }
  const jack = balls.find((b) => b.kind === 'jack');
  if (jack && jack.status === 'available' && jackBox != null) {
    res.push({ ball: jack, box: jackBox, x: (jackBox - 0.5) * bw, y: rowY(jackRow) - 0.03 });
  }
  return res;
}

/** p に最も近い手持ち球（当たり半径 r） */
export function hitHandBall(hand: HandBall[], p: Vec, r: number): HandBall | null {
  let best: HandBall | null = null;
  let bestD = Infinity;
  for (const h of hand) {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= Math.max(h.ball.radius, r) && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

/** 自由配置のボックス割り当て。null は「指定なし」（ボックスに並べない） */
export type SandboxLayout = MatchType | null;

/** 盤面の球にボックス番号が付いていれば、その試合形式で並べている */
export function sandboxLayoutOf(board: Board, matchType: MatchType): SandboxLayout {
  return board.balls.some((b) => b.kind === 'color' && b.playerBox != null) ? matchType : null;
}

/**
 * 自由配置の球に、試合形式どおりのボックス番号を付け直す（番号の小さい球から順に各選手へ）。
 * 非公式の追加球と規定数を超える球にはボックスを付けない。layout が null なら全部外す。
 */
export function assignBoxes(balls: Ball[], profile: RuleProfile, layout: SandboxLayout): void {
  for (const b of balls) delete b.playerBox;
  if (!layout) return;
  const mt = profile.matchTypes[layout];
  for (const side of ['red', 'blue'] as const) {
    const boxes = side === 'red' ? mt.redBoxes : mt.blueBoxes;
    const own = balls.filter((b) => b.kind === 'color' && b.side === side && !b.unofficial).sort((a, b) => a.number - b.number);
    own.forEach((b, i) => {
      const box = boxes[Math.floor(i / mt.ballsPerPlayer)];
      if (box != null) b.playerBox = box;
    });
  }
}
