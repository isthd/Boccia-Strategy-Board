// 次投球サイドの判定（純粋関数）。規則差分は RuleProfile 経由で扱う。
// 出典：通常版 §10.5, 10.6, 10.9, 10.11.3–10.11.4, 10.13／フレンドリー版 §8.5, 8.6, 8.9, 8.11.2, 8.12

import type { Ball, CourtConfig, Side, TieResolution } from './types';
import { otherSide, sideLabel } from './types';
import type { RuleProfile } from './rules/profile';
import { computeScore } from './scoring';
import { NEAR_THRESHOLD } from './numeric';

export interface TurnInput {
  balls: Ball[];
  court: CourtConfig;
  /** 各サイドの残り投球数 */
  remaining: Record<Side, number>;
  /** このエンドで各サイドが投球したカラー球の数 */
  thrown: Record<Side, number>;
  /** 最後にカラー球を投球したサイド */
  lastThrower: Side | null;
  /** 有効なジャック（またはクロスに置かれたジャック）のサイド */
  jackSide: Side | null;
  /** 直前の投球でジャックがクロスに置き直された場合、ジャックを弾き出したサイド */
  jackResetBy: Side | null;
  tieResolution: TieResolution;
}

export interface TurnDecision {
  side: Side | null;
  endComplete: boolean;
  manualRequired: boolean;
  reason: string;
  ruleRef: string;
  warnings: string[];
}

export function nextSide(input: TurnInput, profile: RuleProfile): TurnDecision {
  const { remaining, thrown, jackSide } = input;
  const warnings: string[] = [];
  const done = (side: Side | null, reason: string, ruleRef: string, manualRequired = false): TurnDecision => ({
    side,
    endComplete: false,
    manualRequired,
    reason,
    ruleRef,
    warnings,
  });

  if (remaining.red <= 0 && remaining.blue <= 0) {
    return { side: null, endComplete: true, manualRequired: false, reason: '両サイドとも投球を終えました。エンド終了・採点へ。', ruleRef: profile.refs.scoring, warnings };
  }

  // 片方のサイドしか球が残っていない場合は判定に関係なくそのサイド
  const forceIfExhausted = (d: TurnDecision): TurnDecision => {
    if (d.side && remaining[d.side] <= 0) {
      const s = otherSide(d.side);
      return {
        ...d,
        side: s,
        manualRequired: false,
        reason: `${sideLabel(d.side)}は投球を終えたため、${sideLabel(s)}が残りの球を投球（本来の判定：${d.reason}）`,
        ruleRef: profile.refs.remaining,
      };
    }
    if (d.side == null && d.manualRequired) {
      if (remaining.red <= 0) return { ...d, side: 'blue', manualRequired: false, reason: '赤は投球を終えたため青が投球' };
      if (remaining.blue <= 0) return { ...d, side: 'red', manualRequired: false, reason: '青は投球を終えたため赤が投球' };
    }
    return d;
  };

  if (!jackSide) {
    return done(null, 'ジャックの担当サイドが未確定です。', profile.refs.jackThrow, true);
  }

  // 1球目のカラーボール：有効ジャックを投球した選手（サイド）
  if (thrown.red + thrown.blue === 0) {
    return forceIfExhausted(done(jackSide, `有効なジャックを投球した${sideLabel(jackSide)}が最初のカラー球を投球`, profile.refs.firstColor));
  }

  const score = computeScore(input.balls, input.court, input.tieResolution);
  const other = otherSide(jackSide);

  // 先攻サイドだけが投球済みで、まだ有効球がない → 同じサイドが続けて投球
  if (thrown[other] === 0) {
    const hasValid = score.ranking.some((r) => r.side === jackSide);
    if (!hasValid) {
      return forceIfExhausted(
        done(jackSide, `${sideLabel(jackSide)}はプレイングエリア内に球を止めるまで（または球を使い切るまで）続けて投球`, profile.refs.firstColorOut),
      );
    }
    return forceIfExhausted(done(other, `${sideLabel(other)}が最初の球を投球`, profile.refs.opponentFirst));
  }

  if (score.nearTie) {
    warnings.push(`赤と青の最寄り球の距離差が${NEAR_THRESHOLD * 1000}mm未満です（近接・要計測）。計測・審判判断で補正できます。`);
  }

  switch (score.relation) {
    case 'noJack':
      return done(null, 'ジャックがコート上にありません。', profile.refs.jackOut, true);
    case 'none': {
      if (input.jackResetBy) {
        if (profile.jackResetNoColorRule === 'knockerThrows') {
          return forceIfExhausted(
            done(input.jackResetBy, `ジャックがクロスに置き直され、カラー球がないため、ジャックを弾き出した${sideLabel(input.jackResetBy)}が投球`, profile.refs.jackOut),
          );
        }
        return forceIfExhausted(
          done(null, 'ジャック再配置後にカラー球がない場合の投球サイドは、この規則版の本文に明示がありません。主催者・審判判断が必要です。', profile.refs.jackOut, true),
        );
      }
      return forceIfExhausted(
        done(null, 'プレイングエリア内に有効なカラー球がありません。この局面の投球サイドは規則本文に明示がないため、審判判断で選択してください。', profile.refs.remaining, true),
      );
    }
    case 'onlyRed':
    case 'red':
      return forceIfExhausted(done('blue', 'ジャックに最も近い球は赤 → 相手サイドの青が投球', profile.refs.remaining));
    case 'onlyBlue':
    case 'blue':
      return forceIfExhausted(done('red', 'ジャックに最も近い球は青 → 相手サイドの赤が投球', profile.refs.remaining));
    case 'equal': {
      if (score.red === score.blue) {
        if (!input.lastThrower) return done(null, '等距離・同得点ですが最後の投球サイドが不明です。', profile.refs.equidistant, true);
        return forceIfExhausted(
          done(input.lastThrower, `等距離・同得点（${score.red}:${score.blue}）→ 最後に投球した${sideLabel(input.lastThrower)}が投球（以後交互）`, profile.refs.equidistant),
        );
      }
      if (profile.unequalTieRule === 'fewerScoringBalls') {
        const fewer: Side = score.red < score.blue ? 'red' : 'blue';
        return forceIfExhausted(
          done(fewer, `等距離だが得点球数が異なる（赤${score.red}:青${score.blue}）→ 得点球の少ない${sideLabel(fewer)}が投球`, profile.refs.equidistant),
        );
      }
      return forceIfExhausted(
        done(
          null,
          `等距離だが得点球数が異なる（赤${score.red}:青${score.blue}）。この規則版の本文には明示がありません。主催者・審判判断が必要です。`,
          profile.refs.equidistant,
          true,
        ),
      );
    }
  }
}

/**
 * 自由配置モード用の参考判定。投球履歴を持たないため、配置だけから「ジャックから遠い側」を示す。
 */
export function sandboxHint(balls: Ball[], court: CourtConfig, tieResolution: TieResolution): string {
  const s = computeScore(balls, court, tieResolution);
  switch (s.relation) {
    case 'noJack':
      return 'ジャックを配置すると判定します。';
    case 'none':
      return '有効なカラー球がありません（投球順は履歴がないため判定しません）。';
    case 'red':
    case 'onlyRed':
      return '赤が最も近い → 原則として青が次に投球（参考）';
    case 'blue':
    case 'onlyBlue':
      return '青が最も近い → 原則として赤が次に投球（参考）';
    case 'equal':
      return s.red === s.blue
        ? '等距離・同得点 → 最後に投球した側が投球（自由配置では投球履歴がないため判定しません）'
        : `等距離・得点球数が異なる（赤${s.red}:青${s.blue}）→ 規則版により扱いが異なります`;
  }
}
