import { describe, expect, it } from 'vitest';
import { createMatch, defaultSetup } from '../domain/match';
import { assignBoxes, handBalls, sandboxLayoutOf } from '../domain/hand';
import { emptyBoard, makeColorBall } from '../domain/document';
import { boxAt, DEFAULT_COURT } from '../domain/geometry';
import { standardV2 } from '../domain/rules/standard-v2';

const court = DEFAULT_COURT;
const countByBox = (h: ReturnType<typeof handBalls>) => {
  const r: Record<number, number> = {};
  for (const x of h) if (x.ball.kind === 'color') r[x.box] = (r[x.box] ?? 0) + 1;
  return r;
};

describe('手持ち球のボックス配置', () => {
  it('チーム戦は1〜6番に2球ずつ並び、すべて自分のボックス内に収まる', () => {
    const m = createMatch(standardV2, defaultSetup(standardV2, 'team'));
    const h = handBalls(m.board.balls, court, null);
    expect(countByBox(h)).toEqual({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 });
    for (const x of h) expect(boxAt(court, x)).toBe(x.box);
  });

  it('個人戦は3番・4番に6球ずつ並ぶ', () => {
    const m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    const h = handBalls(m.board.balls, court, 3);
    expect(countByBox(h)).toEqual({ 3: 6, 4: 6 });
    const jack = h.find((x) => x.ball.kind === 'jack');
    expect(jack?.box).toBe(3);
    for (const x of h) expect(boxAt(court, x)).toBe(x.box);
  });

  it('投げた球（コート上の球）はボックスから消える', () => {
    const m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    const red = m.board.balls.find((b) => b.kind === 'color' && b.side === 'red')!;
    red.status = 'inPlay';
    m.board.balls.find((b) => b.kind === 'jack')!.status = 'inPlay';
    const h = handBalls(m.board.balls, court, 3);
    expect(countByBox(h)).toEqual({ 3: 5, 4: 6 });
    expect(h.some((x) => x.ball.id === red.id || x.ball.kind === 'jack')).toBe(false);
  });
});

describe('自由配置の試合形式切り替え', () => {
  it('指定なしの盤面はボックスに並べない', () => {
    const board = emptyBoard();
    expect(sandboxLayoutOf(board, 'individual')).toBeNull();
    expect(handBalls(board.balls, court, null)).toEqual([]);
  });

  it('チーム戦を選ぶと赤1〜6・青1〜6が各ボックスに2球ずつ入る', () => {
    const board = emptyBoard();
    assignBoxes(board.balls, standardV2, 'team');
    expect(sandboxLayoutOf(board, 'team')).toBe('team');
    expect(countByBox(handBalls(board.balls, court, null))).toEqual({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 });
  });

  it('個人戦に切り替えると3番・4番に6球ずつになり、指定なしに戻すと外れる', () => {
    const board = emptyBoard();
    assignBoxes(board.balls, standardV2, 'team');
    assignBoxes(board.balls, standardV2, 'individual');
    expect(countByBox(handBalls(board.balls, court, null))).toEqual({ 3: 6, 4: 6 });
    assignBoxes(board.balls, standardV2, null);
    expect(sandboxLayoutOf(board, 'individual')).toBeNull();
  });

  it('非公式の追加球はボックスに入れない', () => {
    const board = emptyBoard();
    board.balls.push(makeColorBall('red', 7, { unofficial: true }));
    assignBoxes(board.balls, standardV2, 'pair');
    expect(board.balls.find((b) => b.number === 7)?.playerBox).toBeUndefined();
    expect(countByBox(handBalls(board.balls, court, null))).toEqual({ 2: 3, 3: 3, 4: 3, 5: 3 });
  });
});
