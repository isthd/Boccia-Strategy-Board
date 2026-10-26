// ルールプロファイルの型。UIから規則版ごとに分岐せず、このインターフェースを通して規則差分を扱う。

import type { MatchType, RuleProfileId, Side } from '../types';

export interface MatchTypeRule {
  /** 1選手あたりのカラー球数 */
  ballsPerPlayer: number;
  playersPerSide: number;
  redBoxes: number[];
  blueBoxes: number[];
  defaultEnds: number;
  /** エンド数が規則本文の確定値ではなく初期提案である */
  endsProvisional: boolean;
  /** ジャック投球ローテーション（エンド順のボックス番号） */
  jackRotationBoxes: number[];
  /** ローテーションが規則本文の確定値ではなく初期提案である */
  jackRotationProvisional: boolean;
}

export interface ClassOption {
  code: string;
  label: string;
  timeSec: number;
}

export interface JackThrowerDecision {
  box: number | null;
  side: Side | null;
  manualRequired: boolean;
  reason: string;
  ruleRef: string;
  provisional: boolean;
}

export type TieBreakRule =
  | {
      kind: 'extraEnd';
      label: string;
      ruleRef: string;
      description: string;
    }
  | {
      kind: 'finalShot';
      label: string;
      ruleRef: string;
      description: string;
      ballsPerSide: number;
      timeSec: number;
    };

export interface RuleProfile {
  id: RuleProfileId;
  name: string;
  shortName: string;
  sourceDoc: string;
  matchTypes: Record<MatchType, MatchTypeRule>;
  /** 競技クラス（該当時）と持ち時間 */
  classes: Record<MatchType, ClassOption[]>;
  /** 持ち時間の注記 */
  timeNote: string;
  timeRef: string;
  /** 等距離だが得点球数が異なる場合の次投球 */
  unequalTieRule: 'fewerScoringBalls' | 'manual';
  /** ジャックがクロスに置き直され、カラー球が1つもない場合の次投球 */
  jackResetNoColorRule: 'knockerThrows' | 'manual';
  /** クロス上に球があってジャックを置けない場合 */
  occupiedCrossRule: 'frontOfCross' | 'manual';
  /** 最終エンドでジャックがファウルになった場合の扱い */
  finalEndJackFoul: 'firstEndThrower' | 'manual';
  /** 2回以上連続でジャックがファウルになった場合 */
  repeatedJackFoul: 'continueRotation' | 'manual';
  tieBreak: TieBreakRule;
  /** ペナルティボール加点フローを持つか */
  penaltyBalls: boolean;
  /** 35cmターゲットボックスを表示するか（初期値） */
  showTargetBox: boolean;
  /** 規則出典（キー → 「資料名 §」） */
  refs: Record<RuleRefKey, string>;
  /** ヘルプ用の注記 */
  notes: string[];
}

export type RuleRefKey =
  | 'court'
  | 'matchTypes'
  | 'time'
  | 'jackThrow'
  | 'jackFoul'
  | 'firstColor'
  | 'firstColorOut'
  | 'opponentFirst'
  | 'remaining'
  | 'out'
  | 'jackOut'
  | 'equidistant'
  | 'scoring'
  | 'tieBreak'
  | 'penalty'
  | 'bnp';
