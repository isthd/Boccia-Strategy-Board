import type { MatchType, RuleProfileId, Side } from '../types';
import type { JackThrowerDecision, RuleProfile } from './profile';
import { standardV2 } from './standard-v2';
import { friendlyV2 } from './friendly-v2';

export const RULE_PROFILES: Record<RuleProfileId, RuleProfile> = {
  'standard-2021-2024-v2': standardV2,
  'friendly-v2': friendlyV2,
};

export const PROFILE_IDS = Object.keys(RULE_PROFILES) as RuleProfileId[];

export function getProfile(id: RuleProfileId): RuleProfile {
  return RULE_PROFILES[id] ?? standardV2;
}

/** ボックス番号からサイドを求める */
export function sideOfBox(profile: RuleProfile, matchType: MatchType, box: number): Side | null {
  const mt = profile.matchTypes[matchType];
  if (mt.redBoxes.includes(box)) return 'red';
  if (mt.blueBoxes.includes(box)) return 'blue';
  return null;
}

/**
 * エンドのジャック投球担当（ボックス）。
 * @param endIndex 0始まりのエンド番号（正規エンドのみ）
 * @param foulCount そのエンドで既にファウルになったジャックの回数
 */
export function jackThrower(
  profile: RuleProfile,
  matchType: MatchType,
  endIndex: number,
  numEnds: number,
  foulCount: number,
): JackThrowerDecision {
  const mt = profile.matchTypes[matchType];
  const rot = mt.jackRotationBoxes;
  const at = (i: number) => rot[((i % rot.length) + rot.length) % rot.length];
  const mk = (box: number | null, reason: string, manualRequired = false): JackThrowerDecision => ({
    box,
    side: box == null ? null : sideOfBox(profile, matchType, box),
    manualRequired,
    reason,
    ruleRef: foulCount > 0 ? profile.refs.jackFoul : profile.refs.matchTypes,
    provisional: mt.jackRotationProvisional,
  });

  if (foulCount === 0) {
    return mk(
      at(endIndex),
      mt.jackRotationProvisional
        ? `第${endIndex + 1}エンドの担当（通常版からの初期提案／大会要確認）`
        : `第${endIndex + 1}エンドの担当`,
    );
  }
  const isFinal = endIndex >= numEnds - 1;
  if (foulCount === 1 && !isFinal) {
    return mk(at(endIndex + 1), 'ジャックがファウル：次のエンドでジャックを投球する選手が投球');
  }
  if (foulCount === 1 && isFinal) {
    if (profile.finalEndJackFoul === 'firstEndThrower') {
      return mk(at(0), '最終エンドのジャックファウル：第1エンドでジャックを投球した選手が投球');
    }
    return mk(null, '最終エンドでのジャックファウルは規則本文に明示がありません。主催者・審判判断が必要です。', true);
  }
  // 2回目以降のファウル
  if (profile.repeatedJackFoul === 'continueRotation') {
    return mk(at(endIndex + foulCount), `ジャックファウル${foulCount}回目：有効になるまで同じ手順を繰り返す`);
  }
  return mk(null, '連続したジャックファウルの担当は規則本文に明示がありません。主催者・審判判断が必要です。', true);
}

export function defaultTimeSec(profile: RuleProfile, matchType: MatchType, classCode: string | null): number {
  const list = profile.classes[matchType];
  return (list.find((c) => c.code === classCode) ?? list[0]).timeSec;
}

export type { RuleProfile } from './profile';
