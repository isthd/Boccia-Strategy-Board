import { describe, expect, it } from 'vitest';
import { nextSide, type TurnInput } from '../domain/turn-engine';
import { standardV2 } from '../domain/rules/standard-v2';
import { friendlyV2 } from '../domain/rules/friendly-v2';
import { DEFAULT_COURT } from '../domain/geometry';
import { makeColorBall, makeJack } from '../domain/document';
import type { Ball, Side } from '../domain/types';

const C = DEFAULT_COURT;
const jack: Ball = { ...makeJack(), status: 'inPlay' };
let n = 0;
const b = (side: Side, x: number, y: number, status: Ball['status'] = 'inPlay') => makeColorBall(side, ++n, { x, y, status });

const input = (over: Partial<TurnInput>): TurnInput => ({
  balls: [jack],
  court: C,
  remaining: { red: 6, blue: 6 },
  thrown: { red: 0, blue: 0 },
  lastThrower: null,
  jackSide: 'red',
  jackResetBy: null,
  tieResolution: 'auto',
  ...over,
});

describe.each([
  ['通常版', standardV2],
  ['フレンドリー版', friendlyV2],
])('%s 共通の投球順', (_n, p) => {
  it('有効ジャックを投球したサイドが最初のカラー球', () => {
    expect(nextSide(input({ jackSide: 'blue' }), p).side).toBe('blue');
  });
  it('初球アウト：同じサイドが有効球を置くまで続ける', () => {
    const d = nextSide(input({ balls: [jack, b('red', 0, 0, 'out')], thrown: { red: 1, blue: 0 }, remaining: { red: 5, blue: 6 }, lastThrower: 'red' }), p);
    expect(d.side).toBe('red');
  });
  it('初球アウトで球を使い切ったら相手サイド', () => {
    const outs = Array.from({ length: 6 }, () => b('red', 0, 0, 'out'));
    const d = nextSide(input({ balls: [jack, ...outs], thrown: { red: 6, blue: 0 }, remaining: { red: 0, blue: 6 }, lastThrower: 'red' }), p);
    expect(d.side).toBe('blue');
  });
  it('先攻の初球が有効なら相手サイドが投球', () => {
    const d = nextSide(input({ balls: [jack, b('red', 3.5, 5)], thrown: { red: 1, blue: 0 }, remaining: { red: 5, blue: 6 }, lastThrower: 'red' }), p);
    expect(d.side).toBe('blue');
  });
  it('ジャックから遠い側が次に投球', () => {
    const balls = [jack, b('red', 3.5, 5), b('blue', 3.2, 5)];
    expect(nextSide(input({ balls, thrown: { red: 1, blue: 1 }, remaining: { red: 5, blue: 5 }, lastThrower: 'blue' }), p).side).toBe('red');
  });
  it('残り球0のサイドは投球せず、相手が残りを投球', () => {
    const balls = [jack, b('red', 3.5, 5), b('blue', 3.2, 5)];
    const d = nextSide(input({ balls, thrown: { red: 6, blue: 1 }, remaining: { red: 0, blue: 5 }, lastThrower: 'red' }), p);
    expect(d.side).toBe('blue');
  });
  it('両サイド残り0でエンド終了', () => {
    expect(nextSide(input({ remaining: { red: 0, blue: 0 }, thrown: { red: 6, blue: 6 } }), p).endComplete).toBe(true);
  });
  it('等距離・同得点：最後に投球したサイドが投球', () => {
    const balls = [jack, b('red', 3.2, 5), b('blue', 2.8, 5)];
    expect(nextSide(input({ balls, thrown: { red: 1, blue: 1 }, remaining: { red: 5, blue: 5 }, lastThrower: 'blue' }), p).side).toBe('blue');
    expect(nextSide(input({ balls, thrown: { red: 2, blue: 1 }, remaining: { red: 4, blue: 5 }, lastThrower: 'red' }), p).side).toBe('red');
  });
  it('近接（1mm未満）は警告を出す', () => {
    const balls = [jack, b('red', 3.2, 5), b('blue', 2.8 - 0.0003, 5)];
    const d = nextSide(input({ balls, thrown: { red: 1, blue: 1 }, remaining: { red: 5, blue: 5 }, lastThrower: 'blue' }), p);
    expect(d.warnings.length).toBeGreaterThan(0);
  });
});

describe('規則版で異なる処理', () => {
  const unequalTie = () => input({ balls: [jack, b('red', 3.2, 5), b('red', 3, 5.2), b('blue', 2.8, 5)], thrown: { red: 2, blue: 1 }, remaining: { red: 4, blue: 5 }, lastThrower: 'red' });
  it('通常版：等距離で得点球数が異なる（2:1）→ 得点球の少ない側（§10.13）', () => {
    const d = nextSide(unequalTie(), standardV2);
    expect(d.side).toBe('blue');
    expect(d.manualRequired).toBe(false);
  });
  it('フレンドリー版：同局面は本文に明示がない → 手動判断', () => {
    const d = nextSide(unequalTie(), friendlyV2);
    expect(d.side).toBeNull();
    expect(d.manualRequired).toBe(true);
    expect(d.reason).toContain('主催者・審判判断');
  });

  const jackResetNoBalls = () =>
    input({ balls: [jack, b('red', 0, 0, 'out'), b('blue', 0, 0, 'out')], thrown: { red: 1, blue: 1 }, remaining: { red: 5, blue: 5 }, lastThrower: 'blue', jackResetBy: 'blue' });
  it('通常版：ジャック再配置後にカラー球がない → 弾き出したサイド（§10.11.4）', () => {
    expect(nextSide(jackResetNoBalls(), standardV2).side).toBe('blue');
  });
  it('フレンドリー版：同局面は手動判断', () => {
    expect(nextSide(jackResetNoBalls(), friendlyV2).manualRequired).toBe(true);
  });
  it('手動判断が必要でも片側しか球が残っていなければ自動で決まる', () => {
    const i = unequalTie();
    i.remaining = { red: 4, blue: 0 };
    expect(nextSide(i, friendlyV2)).toMatchObject({ side: 'red', manualRequired: false });
  });
});
