import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  DEFAULT_COURT,
  arrowAngleDeg,
  boxAt,
  boxCenter,
  contactCandidates,
  isCircleInPlayingArea,
  jackAreaStatus,
  jackResetPosition,
  resolveOverlap,
  vLineY,
  distance,
} from '../domain/geometry';
import { makeColorBall, makeJack } from '../domain/document';

const C = DEFAULT_COURT;
const R = BALL_RADIUS;

describe('コート寸法', () => {
  it('標準寸法 6.00m × 12.50m、投球ライン10.00m、クロス(3,5)、V頂点(3,8.5)', () => {
    expect(C.width).toBe(6);
    expect(C.length).toBe(12.5);
    expect(C.playingLength).toBe(10);
    expect(C.cross).toEqual({ x: 3, y: 5 });
    expect(C.vApex).toEqual({ x: 3, y: 8.5 });
    expect(C.vLeft).toEqual({ x: 0, y: 7 });
    expect(C.vRight).toEqual({ x: 6, y: 7 });
  });
  it('スローイングボックスは横1mずつ6分割（左から1〜6番）', () => {
    for (let i = 1; i <= 6; i++) {
      const c = boxCenter(C, i);
      expect(c.x).toBeCloseTo(i - 0.5, 12);
      expect(c.y).toBeCloseTo(11.25, 12);
      expect(boxAt(C, { x: i - 0.5, y: 11 })).toBe(i);
    }
    expect(boxAt(C, { x: 3, y: 9.9 })).toBeNull();
  });
  it('公称円周270mmからの半径 ≒ 0.043m', () => {
    expect(R).toBeCloseTo(0.04297, 4);
  });
  it('Vラインの y 座標', () => {
    expect(vLineY(C, 0)).toBe(7);
    expect(vLineY(C, 3)).toBe(8.5);
    expect(vLineY(C, 6)).toBe(7);
    expect(vLineY(C, 1.5)).toBeCloseTo(7.75, 12);
    expect(vLineY(C, 4.5)).toBeCloseTo(7.75, 12);
  });
});

describe('プレイングエリア判定（円と境界）', () => {
  it('中心がエリア内でも円が外周の縁に接触・越えていればエリア外', () => {
    expect(isCircleInPlayingArea({ x: 3, y: 5 }, R, C)).toBe(true);
    expect(isCircleInPlayingArea({ x: R, y: 5 }, R, C)).toBe(false); // ちょうど接触
    expect(isCircleInPlayingArea({ x: R + 0.001, y: 5 }, R, C)).toBe(true);
    expect(isCircleInPlayingArea({ x: 0.01, y: 5 }, R, C)).toBe(false); // 中心は内側だがはみ出し
    expect(isCircleInPlayingArea({ x: 3, y: 10 - R / 2 }, R, C)).toBe(false); // スローイングラインにかかる
    expect(isCircleInPlayingArea({ x: 3, y: 11 }, R, C)).toBe(false); // ボックス内
  });
});

describe('ジャック有効エリア（Vライン）', () => {
  it('クロス上は有効', () => {
    expect(jackAreaStatus({ x: 3, y: 5 }, R, C)).toBe('valid');
  });
  it('中心が無効エリア側なら invalidArea', () => {
    expect(jackAreaStatus({ x: 3, y: 9 }, R, C)).toBe('invalidArea');
    expect(jackAreaStatus({ x: 0.5, y: 7.5 }, R, C)).toBe('invalidArea');
  });
  it('中心は有効側でも円がVラインにかかっていれば touchingV（中心点だけで判定しない）', () => {
    expect(jackAreaStatus({ x: 3, y: 8.5 - R / 2 }, R, C)).toBe('touchingV');
    // 頂点の真上：斜辺までの法線距離で判定するため、半径+1mm上でもまだVラインにかかる
    expect(jackAreaStatus({ x: 3, y: 8.5 - R - 0.001 }, R, C)).toBe('touchingV');
    expect(jackAreaStatus({ x: 3, y: 8.5 - R / Math.cos(Math.atan(0.5)) - 0.001 }, R, C)).toBe('valid');
    // 斜辺に対して法線方向の距離で判定（垂直距離ではない）
    const slopeNormalDist = (dy: number) => dy * Math.cos(Math.atan(0.5));
    const dy = (R + 0.0005) / Math.cos(Math.atan(0.5));
    expect(slopeNormalDist(dy)).toBeGreaterThan(R);
    expect(jackAreaStatus({ x: 1.5, y: 7.75 - dy }, R, C)).toBe('valid');
    expect(jackAreaStatus({ x: 1.5, y: 7.75 - R }, R, C)).toBe('touchingV'); // 垂直距離=Rでも法線距離<R
  });
  it('外周にかかる場合は outOfPlayingArea', () => {
    expect(jackAreaStatus({ x: 0.02, y: 2 }, R, C)).toBe('outOfPlayingArea');
    expect(jackAreaStatus({ x: 3, y: 0.01 }, R, C)).toBe('outOfPlayingArea');
  });
});

describe('ズーム・表示に依存しない実座標計算', () => {
  it('距離は座標(m)のみから決まる', () => {
    expect(distance({ x: 3, y: 5 }, { x: 3.3, y: 5.4 })).toBeCloseTo(0.5, 12);
  });
});

describe('重なり回避・接触スナップ', () => {
  it('重なった球を中心線方向へ押し出して接触位置に置く', () => {
    const other = { x: 3, y: 5, radius: R };
    const p = resolveOverlap({ x: 3.01, y: 5 }, R, [other]);
    expect(distance(p, other)).toBeCloseTo(2 * R, 9);
    expect(p.y).toBeCloseTo(5, 9);
    expect(p.x).toBeGreaterThan(3);
  });
});

describe('戦術矢印', () => {
  it('角度：真正面0°、右が正', () => {
    expect(arrowAngleDeg({ x: 3, y: 11 }, { x: 3, y: 5 })).toBeCloseTo(0, 9);
    expect(arrowAngleDeg({ x: 3, y: 11 }, { x: 4, y: 10 })).toBeCloseTo(45, 9);
    expect(arrowAngleDeg({ x: 3, y: 11 }, { x: 2, y: 10 })).toBeCloseTo(-45, 9);
  });
  it('直線経路上の接触候補', () => {
    const a = makeColorBall('red', 1, { x: 3, y: 7, status: 'inPlay' });
    const b = makeColorBall('blue', 1, { x: 3.5, y: 7, status: 'inPlay' });
    const c = contactCandidates({ x: 3, y: 11.25 }, { x: 3, y: 5 }, R, [a, b]);
    expect(c.map((x) => x.ballId)).toEqual(['red-1']);
  });
});

describe('ジャックのクロス再配置', () => {
  it('クロスが空いていればクロス', () => {
    const r = jackResetPosition(C, [], R, 'frontOfCross');
    expect(r).toEqual({ kind: 'cross', position: { x: 3, y: 5 } });
  });
  it('通常版：クロスに球があれば前面（+y方向）の中央でできるだけ近く', () => {
    const ball = makeColorBall('red', 1, { x: 3, y: 5, status: 'inPlay' });
    const r = jackResetPosition(C, [ball], R, 'frontOfCross');
    expect(r.kind).toBe('frontOfCross');
    expect(r.position.x).toBe(3);
    expect(r.position.y).toBeGreaterThan(5);
    expect(distance(r.position, ball)).toBeGreaterThanOrEqual(2 * R - 1e-9);
    expect(distance(r.position, ball)).toBeLessThan(2 * R + 0.001);
  });
  it('フレンドリー版（規定なし）：クロスが塞がっていれば手動確定', () => {
    const ball = makeColorBall('red', 1, { x: 3, y: 5, status: 'inPlay' });
    expect(jackResetPosition(C, [ball], R, 'manual').kind).toBe('manual');
  });
  it('アウト球はクロスを塞がない', () => {
    const ball = makeColorBall('red', 1, { x: 3, y: 5, status: 'out' });
    expect(jackResetPosition(C, [ball, makeJack()], R, 'frontOfCross').kind).toBe('cross');
  });
});
