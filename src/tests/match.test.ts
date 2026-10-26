import { describe, expect, it } from 'vitest';
import {
  addPenalty,
  confirmEnd,
  createMatch,
  currentJackThrower,
  declareBNP,
  decideNext,
  defaultSetup,
  recordColorThrow,
  recordJack,
  remainingThrows,
  setPenaltyResult,
  startTiebreak,
  totals,
  type MatchState,
} from '../domain/match';
import { standardV2 } from '../domain/rules/standard-v2';
import { friendlyV2 } from '../domain/rules/friendly-v2';
import { DEFAULT_COURT } from '../domain/geometry';
import type { RuleProfile } from '../domain/rules/profile';
import type { Side } from '../domain/types';

const C = DEFAULT_COURT;

function placeJack(m: MatchState, x = 3, y = 5) {
  const j = m.board.balls.find((b) => b.kind === 'jack')!;
  j.x = x;
  j.y = y;
  j.status = 'inPlay';
}

function place(m: MatchState, side: Side, x: number, y: number): MatchState {
  const ball = m.board.balls.find((b) => b.side === side && b.status === 'available')!;
  ball.x = x;
  ball.y = y;
  ball.status = 'inPlay';
  m.pendingBallId = ball.id;
  return m;
}

function throwAt(m: MatchState, p: RuleProfile, side: Side, x: number, y: number) {
  const mm = place(JSON.parse(JSON.stringify(m)), side, x, y);
  return recordColorThrow(mm, C, p, { side, box: null, result: 'valid', note: '', durationSec: 10, markOutIds: [], resetJack: false }).match;
}

/** 1エンドを全球投げきる（赤が全部近い） */
function playEnd(m: MatchState, p: RuleProfile, redCloser: boolean): MatchState {
  const t = currentJackThrower(m, p);
  placeJack(m);
  m = recordJack(m, C, p, { result: 'valid', box: t.box, note: '', durationSec: 5 });
  let i = 0;
  while (m.phase === 'color') {
    const d = decideNext(m, C, p);
    const side = d.side!;
    const near = (side === 'red') === redCloser;
    i++;
    m = throwAt(m, p, side, 3 + (near ? 0.1 : 0.5) + i * 0.001, 5);
  }
  return m;
}

describe('試合再現：通常版 個人戦', () => {
  it('ジャック→カラー→エンド採点→次エンド、ドラッグでは球数が減らない', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    expect(currentJackThrower(m, standardV2).box).toBe(3);
    // 盤面にジャックを置いただけ（記録前）では投球履歴は増えない
    placeJack(m);
    expect(m.throws).toHaveLength(0);
    m = recordJack(m, C, standardV2, { result: 'valid', box: 3, note: '', durationSec: 4 });
    expect(m.phase).toBe('color');
    expect(decideNext(m, C, standardV2).side).toBe('red');
    // 仮置き（ドラッグ）だけでは残り球数は変わらない
    const placed = place(JSON.parse(JSON.stringify(m)), 'red', 3.2, 5);
    expect(remainingThrows(placed).red).toBe(6);
    m = recordColorThrow(placed, C, standardV2, { side: 'red', box: 3, result: 'valid', note: '', durationSec: 12, markOutIds: [], resetJack: false }).match;
    expect(remainingThrows(m).red).toBe(5);
    expect(decideNext(m, C, standardV2).side).toBe('blue');
  });

  it('ジャックファウル：次エンドの担当が投球し、後続エンドの担当順は変わらない', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    m = recordJack(m, C, standardV2, { result: 'foul', box: 3, note: '', durationSec: 5 });
    expect(currentJackThrower(m, standardV2).side).toBe('blue');
    m = playEnd(m, standardV2, true);
    expect(m.phase).toBe('endScoring');
    m = confirmEnd(m, C, standardV2, { override: null, remainingSec: { red: 100, blue: 100 } }).match;
    // 第2エンドは本来の担当（青）
    expect(m.ends).toHaveLength(2);
    expect(currentJackThrower(m, standardV2).side).toBe('blue');
  });

  it('BNP申告で残りの球を投球しない', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    placeJack(m);
    m = recordJack(m, C, standardV2, { result: 'valid', box: 3, note: '', durationSec: 5 });
    m = throwAt(m, standardV2, 'red', 3.1, 5);
    m = declareBNP(m, C, standardV2, 'red', '');
    expect(remainingThrows(m).red).toBe(0);
    expect(m.board.balls.filter((b) => b.status === 'BNP')).toHaveLength(5);
    expect(decideNext(m, C, standardV2).side).toBe('blue');
  });

  it('途中でジャックが弾き出されたらクロスへ再配置', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    placeJack(m);
    m = recordJack(m, C, standardV2, { result: 'valid', box: 3, note: '', durationSec: 5 });
    const mm = place(JSON.parse(JSON.stringify(m)), 'red', 3.2, 5);
    const j = mm.board.balls.find((b) => b.kind === 'jack')!;
    j.x = 0.01; // 弾き出された
    const out = recordColorThrow(mm, C, standardV2, { side: 'red', box: 3, result: 'valid', note: '', durationSec: 5, markOutIds: [], resetJack: true });
    const j2 = out.match.board.balls.find((b) => b.kind === 'jack')!;
    expect(j2.x).toBe(3);
    expect(j2.y).toBe(5);
  });

  it('ペナルティボール（通常版のみ）を確定得点に加算', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    m = playEnd(m, standardV2, true);
    m = addPenalty(m, 'blue');
    const pid = m.ends[0].penalties[0].id;
    expect(confirmEnd(m, C, standardV2, { override: null, remainingSec: { red: 0, blue: 0 } }).error).toBeTruthy();
    m = setPenaltyResult(m, pid, 'in');
    m = confirmEnd(m, C, standardV2, { override: null, remainingSec: { red: 0, blue: 0 } }).match;
    expect(m.ends[0].final).toEqual({ red: 6, blue: 1 });
  });

  it('手動得点修正と理由を記録', () => {
    let m = createMatch(standardV2, defaultSetup(standardV2, 'individual'));
    m = playEnd(m, standardV2, true);
    m = confirmEnd(m, C, standardV2, { override: { red: 2, blue: 0, reason: '審判計測' }, remainingSec: { red: 0, blue: 0 } }).match;
    expect(m.ends[0].final).toEqual({ red: 2, blue: 0 });
    expect(m.ends[0].computed).toEqual({ red: 6, blue: 0 });
    expect(m.throws.at(-1)!.note).toContain('審判計測');
  });
});

function playToTie(p: RuleProfile): MatchState {
  let m = createMatch(p, { ...defaultSetup(p, 'individual'), numEnds: 2 });
  m = playEnd(m, p, true);
  m = confirmEnd(m, C, p, { override: null, remainingSec: { red: 0, blue: 0 } }).match;
  m = playEnd(m, p, false);
  m = confirmEnd(m, C, p, { override: null, remainingSec: { red: 0, blue: 0 } }).match;
  return m;
}

describe('タイブレイク：規則版を混同しない', () => {
  it('通常版：同点なら追加エンド（6球ずつ、得点は合計に加算しない）', () => {
    let m = playToTie(standardV2);
    expect(totals(m)).toEqual({ red: 6, blue: 6 });
    expect(m.phase).toBe('tiebreakSetup');
    m = startTiebreak(m, C, standardV2, 'blue');
    const e = m.ends[m.currentEnd];
    expect(e.kind).toBe('tiebreak');
    expect(e.ballLimit).toEqual({ red: 6, blue: 6 });
    expect(m.board.balls.find((b) => b.kind === 'jack')).toMatchObject({ x: 3, y: 5, status: 'inPlay' });
    expect(decideNext(m, C, standardV2).side).toBe('blue');
    // タイブレイクで赤が勝つ
    let i = 0;
    while (m.phase === 'color') {
      const s = decideNext(m, C, standardV2).side!;
      m = throwAt(m, standardV2, s, 3 + (s === 'red' ? 0.1 : 0.5) + ++i * 0.001, 5);
    }
    m = confirmEnd(m, C, standardV2, { override: null, remainingSec: { red: 0, blue: 0 } }).match;
    expect(m.phase).toBe('finished');
    expect(m.winner).toBe('red');
    expect(totals(m)).toEqual({ red: 6, blue: 6 });
  });

  it('通常版：タイブレイクも同点なら前回後攻のサイドのジャックで繰り返す（§13.6）', () => {
    let m = playToTie(standardV2);
    m = startTiebreak(m, C, standardV2, 'red');
    // 全球同距離になるよう投げて 0-0 ではなく同点にする → 手動修正で同点に
    while (m.phase === 'color') {
      const s = decideNext(m, C, standardV2).side!;
      m = throwAt(m, standardV2, s, 3.3, 5);
    }
    m = confirmEnd(m, C, standardV2, { override: { red: 1, blue: 1, reason: 'テスト' }, remainingSec: { red: 0, blue: 0 } }).match;
    expect(m.ends[m.currentEnd].kind).toBe('tiebreak');
    expect(m.ends[m.currentEnd].firstSide).toBe('blue');
  });

  it('フレンドリー版：同点ならファイナルショット（各サイド1球、加点なし）', () => {
    let m = playToTie(friendlyV2);
    expect(m.phase).toBe('tiebreakSetup');
    m = startTiebreak(m, C, friendlyV2, 'red');
    const e = m.ends[m.currentEnd];
    expect(e.kind).toBe('finalShot');
    expect(e.ballLimit).toEqual({ red: 1, blue: 1 });
    m = throwAt(m, friendlyV2, 'red', 3.2, 5);
    expect(decideNext(m, C, friendlyV2).side).toBe('blue');
    m = throwAt(m, friendlyV2, 'blue', 3.1, 5);
    expect(m.phase).toBe('endScoring');
    m = confirmEnd(m, C, friendlyV2, { override: null, remainingSec: { red: 0, blue: 0 } }).match;
    expect(m.winner).toBe('blue');
    expect(totals(m)).toEqual({ red: 6, blue: 6 });
  });

  it('フレンドリー版のファイナルショットにはペナルティ加点を適用しない', () => {
    expect(friendlyV2.penaltyBalls).toBe(false);
  });
});
