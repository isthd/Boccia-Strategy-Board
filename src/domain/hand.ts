// 試合再現で、まだ投げていない球（手持ち）をスローイングボックスの中に並べて見せるための配置計算。
import type { Ball, CourtConfig, Vec } from './types';

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
