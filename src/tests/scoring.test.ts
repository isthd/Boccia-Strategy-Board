import { describe, expect, it } from 'vitest';
import { computeScore } from '../domain/scoring';
import { DEFAULT_COURT } from '../domain/geometry';
import { makeColorBall, makeJack } from '../domain/document';
import type { Ball, Side } from '../domain/types';

const C = DEFAULT_COURT;
const jack = (x = 3, y = 5): Ball => ({ ...makeJack(), x, y, status: 'inPlay' });
let n = 0;
const ball = (side: Side, x: number, y: number, status: Ball['status'] = 'inPlay'): Ball =>
  makeColorBall(side, ++n, { x, y, status });

describe('暫定得点', () => {
  it('赤3球が青の最寄り球より近ければ赤3・青0', () => {
    const s = computeScore([jack(), ball('red', 3.1, 5), ball('red', 3, 5.2), ball('red', 2.75, 5), ball('blue', 3, 5.5)], C);
    expect(s.red).toBe(3);
    expect(s.blue).toBe(0);
    expect(s.relation).toBe('red');
    expect(s.leader).toBe('red');
    expect(s.scoringBallIds).toHaveLength(3);
  });

  it('最寄りの赤1球と青1球が厳密に同距離なら赤1・青1', () => {
    const s = computeScore([jack(), ball('red', 3.2, 5), ball('blue', 2.8, 5), ball('blue', 3, 6)], C);
    expect(s.relation).toBe('equal');
    expect(s.red).toBe(1);
    expect(s.blue).toBe(1);
    expect(s.leader).toBeNull();
  });

  it('座標上の同距離は浮動小数点誤差があっても等距離（例：(3,4.9)と(3.1,5)）', () => {
    const s = computeScore([jack(), ball('red', 3, 4.9), ball('blue', 3.1, 5)], C);
    expect(s.relation).toBe('equal');
    expect(s.red).toBe(1);
    expect(s.blue).toBe(1);
  });

  it('赤2球・青1球が全て最短の同距離なら赤2・青1', () => {
    const s = computeScore([jack(), ball('red', 3.3, 5), ball('red', 2.7, 5), ball('blue', 3, 5.3), ball('blue', 3, 6)], C);
    expect(s.relation).toBe('equal');
    expect(s.red).toBe(2);
    expect(s.blue).toBe(1);
  });

  it('アウト・除去・BNP・未投球の球は距離順位と得点に含まれない', () => {
    const s = computeScore(
      [
        jack(),
        ball('blue', 3.05, 5, 'out'),
        ball('blue', 3.06, 5, 'retracted'),
        ball('blue', 3.07, 5, 'BNP'),
        ball('blue', 3.08, 5, 'available'),
        ball('red', 3.5, 5),
        ball('blue', 4, 5),
      ],
      C,
    );
    expect(s.ranking).toHaveLength(2);
    expect(s.red).toBe(1);
    expect(s.blue).toBe(0);
  });

  it('状態がプレイ中でも位置がエリア外の球は得点から除外し注記する', () => {
    const s = computeScore([jack(), ball('blue', 0.01, 5), ball('red', 3.5, 5)], C);
    expect(s.red).toBe(1);
    expect(s.excluded).toHaveLength(1);
  });

  it('片側に有効球がなければ反対側の有効球すべてが得点', () => {
    const s = computeScore([jack(), ball('blue', 3.5, 5), ball('blue', 1, 1), ball('red', 0, 0, 'out')], C);
    expect(s.relation).toBe('onlyBlue');
    expect(s.blue).toBe(2);
    expect(s.red).toBe(0);
  });

  it('両側に有効球がなければ0–0', () => {
    const s = computeScore([jack(), ball('red', 0, 0, 'out')], C);
    expect(s.relation).toBe('none');
    expect(s.red + s.blue).toBe(0);
  });

  it('ジャックがコート上になければ判定しない', () => {
    const s = computeScore([makeJack(), ball('red', 3, 5)], C);
    expect(s.relation).toBe('noJack');
  });

  it('ほぼ同距離（1mm未満の差）は自動で同距離と断定せず「近接・要計測」とする', () => {
    const s = computeScore([jack(), ball('red', 3.2, 5), ball('blue', 2.8 - 0.0004, 5)], C);
    expect(s.relation).toBe('red');
    expect(s.nearTie).toBe(true);
    expect(s.red).toBe(1);
  });

  it('審判による手動補正：同距離／赤優勢／青優勢', () => {
    const balls = [jack(), ball('red', 3.2, 5), ball('blue', 2.8 - 0.0004, 5), ball('blue', 3, 5.5)];
    expect(computeScore(balls, C, 'equal')).toMatchObject({ relation: 'equal', red: 1, blue: 1, resolutionApplied: 'equal' });
    expect(computeScore(balls, C, 'blue')).toMatchObject({ relation: 'blue', red: 0, blue: 1 });
    expect(computeScore(balls, C, 'red')).toMatchObject({ relation: 'red', red: 1, blue: 0 });
  });

  it('得点境界付近の球を警告する', () => {
    // 赤2球目が青最寄り球との差0.5mm
    const s = computeScore([jack(), ball('red', 3.1, 5), ball('red', 3, 5.3 - 0.0005), ball('blue', 3, 4.7)], C);
    expect(s.red).toBe(2);
    expect(s.boundaryBallIds).toHaveLength(1);
  });

  it('半径を個別に変えた場合は表面間の推定距離で順位を決める', () => {
    const big: Ball = { ...ball('red', 3.2, 5), radius: 0.05 };
    const s = computeScore([jack(), big, ball('blue', 2.8 - 0.003, 5)], C);
    // 中心間は青が近いが、表面間は赤が近い
    expect(s.ranking[0].side).toBe('red');
    expect(s.red).toBe(1);
  });
});
