import { describe, expect, it } from 'vitest';
import { RULE_PROFILES, defaultTimeSec, getProfile, jackThrower } from '../domain/rules/registry';
import { standardV2 } from '../domain/rules/standard-v2';
import { friendlyV2 } from '../domain/rules/friendly-v2';
import { totalBallsPerSide } from '../domain/match';

describe('箱番号と球数', () => {
  for (const p of [standardV2, friendlyV2]) {
    it(`${p.shortName}：個人・ペア・チーム`, () => {
      expect(p.matchTypes.individual).toMatchObject({ redBoxes: [3], blueBoxes: [4], ballsPerPlayer: 6, playersPerSide: 1 });
      expect(p.matchTypes.pair).toMatchObject({ redBoxes: [2, 4], blueBoxes: [3, 5], ballsPerPlayer: 3, playersPerSide: 2 });
      expect(p.matchTypes.team).toMatchObject({ redBoxes: [1, 3, 5], blueBoxes: [2, 4, 6], ballsPerPlayer: 2, playersPerSide: 3 });
      for (const mt of ['individual', 'pair', 'team'] as const) expect(totalBallsPerSide(p, mt)).toBe(6);
    });
  }
});

describe('エンド数', () => {
  it('通常版：個人・ペア4、チーム6（確定）', () => {
    expect(standardV2.matchTypes.individual.defaultEnds).toBe(4);
    expect(standardV2.matchTypes.pair.defaultEnds).toBe(4);
    expect(standardV2.matchTypes.team.defaultEnds).toBe(6);
    expect(standardV2.matchTypes.team.endsProvisional).toBe(false);
  });
  it('フレンドリー版：同じ初期値だが「初期提案／大会要確認」扱い', () => {
    expect(friendlyV2.matchTypes.individual.endsProvisional).toBe(true);
    expect(friendlyV2.matchTypes.team.endsProvisional).toBe(true);
  });
});

describe('持ち時間', () => {
  it('通常版のクラス別持ち時間', () => {
    const t = (mt: 'individual' | 'pair' | 'team', c: string) => defaultTimeSec(standardV2, mt, c);
    expect(t('individual', 'BC1')).toBe(300);
    expect(t('individual', 'BC2')).toBe(240);
    expect(t('individual', 'BC3')).toBe(360);
    expect(t('individual', 'BC4')).toBe(240);
    expect(t('individual', 'OP-seated')).toBe(240);
    expect(t('individual', 'OP-standing')).toBe(240);
    expect(t('team', 'team')).toBe(360);
    expect(t('pair', 'BC3-pair')).toBe(420);
    expect(t('pair', 'BC4-pair')).toBe(300);
  });
  it('フレンドリー版の標準：個人4分、ペア・チーム5分', () => {
    expect(defaultTimeSec(friendlyV2, 'individual', null)).toBe(240);
    expect(defaultTimeSec(friendlyV2, 'pair', null)).toBe(300);
    expect(defaultTimeSec(friendlyV2, 'team', null)).toBe(300);
  });
  it('規則版を切り替えると持ち時間が切り替わる', () => {
    expect(defaultTimeSec(getProfile('standard-2021-2024-v2'), 'team', null)).toBe(360);
    expect(defaultTimeSec(getProfile('friendly-v2'), 'team', null)).toBe(300);
  });
});

describe('ジャック投球担当', () => {
  it('通常版 個人戦：赤→青→赤→青（第1エンドは赤）', () => {
    const boxes = [0, 1, 2, 3].map((i) => jackThrower(standardV2, 'individual', i, 4, 0));
    expect(boxes.map((b) => b.side)).toEqual(['red', 'blue', 'red', 'blue']);
  });
  it('通常版 ペア戦 2→3→4→5、チーム戦 1→…→6', () => {
    expect([0, 1, 2, 3].map((i) => jackThrower(standardV2, 'pair', i, 4, 0).box)).toEqual([2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((i) => jackThrower(standardV2, 'team', i, 6, 0).box)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('通常版 ジャックファウル：次エンドの担当、最終エンドは第1エンドの担当、繰り返し', () => {
    expect(jackThrower(standardV2, 'team', 1, 6, 1).box).toBe(3);
    expect(jackThrower(standardV2, 'team', 5, 6, 1).box).toBe(1);
    expect(jackThrower(standardV2, 'team', 5, 6, 2).box).toBe(2);
    expect(jackThrower(standardV2, 'individual', 0, 4, 1).side).toBe('blue');
  });
  it('フレンドリー版 ジャックファウル：次エンドの担当（§8.4.2）。最終エンド・連続ファウルは手動判断', () => {
    expect(jackThrower(friendlyV2, 'pair', 0, 4, 1)).toMatchObject({ box: 3, manualRequired: false });
    expect(jackThrower(friendlyV2, 'pair', 3, 4, 1)).toMatchObject({ box: null, manualRequired: true });
    expect(jackThrower(friendlyV2, 'pair', 0, 4, 2)).toMatchObject({ box: null, manualRequired: true });
    expect(jackThrower(friendlyV2, 'individual', 1, 4, 0).provisional).toBe(true);
  });
});

describe('規則版の分離', () => {
  it('通常版のタイブレイクは追加エンド、フレンドリー版は1球ずつのファイナルショット', () => {
    expect(standardV2.tieBreak.kind).toBe('extraEnd');
    expect(friendlyV2.tieBreak.kind).toBe('finalShot');
    if (friendlyV2.tieBreak.kind === 'finalShot') {
      expect(friendlyV2.tieBreak.ballsPerSide).toBe(1);
      expect(friendlyV2.tieBreak.timeSec).toBe(60);
    }
  });
  it('ペナルティボール加点フローは通常版のみ', () => {
    expect(standardV2.penaltyBalls).toBe(true);
    expect(friendlyV2.penaltyBalls).toBe(false);
  });
  it('フレンドリー版は本文に明示のない処理を通常版から流用しない', () => {
    expect(friendlyV2.unequalTieRule).toBe('manual');
    expect(friendlyV2.jackResetNoColorRule).toBe('manual');
    expect(friendlyV2.occupiedCrossRule).toBe('manual');
    expect(standardV2.unequalTieRule).toBe('fewerScoringBalls');
  });
  it('全プロファイルに出典がある', () => {
    for (const p of Object.values(RULE_PROFILES)) {
      for (const v of Object.values(p.refs)) expect(v.length).toBeGreaterThan(0);
    }
  });
});
