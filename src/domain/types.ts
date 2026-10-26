// ドメイン型定義。座標はすべてメートル（m）、時間は秒（s）。
// 座標系：原点(0,0)はコート上端左隅（投球エリアと反対側）、右が+x、下が+y。

export type Side = 'red' | 'blue';
export const SIDES: readonly Side[] = ['red', 'blue'] as const;
export const otherSide = (s: Side): Side => (s === 'red' ? 'blue' : 'red');
export const sideLabel = (s: Side): string => (s === 'red' ? '赤' : '青');

/** 球の状態。out/retracted/BNP は距離計算・得点から除外する。available は未投球（コート上にない）。 */
export type BallStatus = 'available' | 'inPlay' | 'out' | 'retracted' | 'BNP' | 'penalty';
export const BALL_STATUS_LABEL: Record<BallStatus, string> = {
  available: '未投球（手持ち）',
  inPlay: 'プレイ中',
  out: 'アウト',
  retracted: '除去（リトラクション）',
  BNP: 'BNP（投球せず）',
  penalty: 'ペナルティ用',
};

export type RuleProfileId = 'standard-2021-2024-v2' | 'friendly-v2';
export type MatchType = 'individual' | 'pair' | 'team';
export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  individual: '個人戦',
  pair: 'ペア戦',
  team: 'チーム戦',
};

export interface Vec {
  x: number;
  y: number;
}

export interface Ball {
  /** 球ID（投球順IDとは別物） */
  id: string;
  kind: 'jack' | 'color';
  side?: Side;
  /** 表示番号（赤1〜赤6など）。ジャックは0 */
  number: number;
  x: number;
  y: number;
  /** m。描画・簡易測定用の近似値 */
  radius: number;
  status: BallStatus;
  /** 制限数を超えて追加した練習用の球 */
  unofficial?: boolean;
  /** 試合再現で、この球を持つ選手のスローイングボックス番号 */
  playerBox?: number;
}

/** コート設定。標準寸法は通常版 p.5–6, p.35–36／フレンドリー版 p.13–14 */
export interface CourtConfig {
  width: number;
  length: number;
  /** プレイングエリアの縦（スローイングライン y 座標） */
  playingLength: number;
  boxCount: number;
  cross: Vec;
  /** Vライン（有効側の縁）の左端・頂点・右端 */
  vLeft: Vec;
  vApex: Vec;
  vRight: Vec;
  targetBoxSize: number;
  /** 表示用の線幅（m）。実寸判定には使わない */
  thickLine: number;
  thinLine: number;
  /** 標準寸法から変更した場合 true（大会申し合わせによる変更） */
  custom: boolean;
  customNote: string;
}

export type TacticTag = 'approach' | 'push' | 'moveJack' | 'block' | 'other';
export const TACTIC_TAG_LABEL: Record<TacticTag, string> = {
  approach: '近づける',
  push: '相手球を押す',
  moveJack: 'ジャックを動かす',
  block: 'ブロックする',
  other: 'その他',
};

export interface TargetMarker {
  id: string;
  type: 'target';
  x: number;
  y: number;
  name: string;
  priority: 1 | 2 | 3;
  memo: string;
  color: string;
}

export interface ArrowAnnotation {
  id: string;
  type: 'arrow';
  from: Vec;
  /** 始点をスローイングボックス中心にスナップした場合のボックス番号 */
  fromBox: number | null;
  to: Vec;
  name: string;
  color: string;
  tags: TacticTag[];
  memo: string;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
}

export type Annotation = TargetMarker | ArrowAnnotation | TextAnnotation;

/** 同距離・近接時の審判による手動補正 */
export type TieResolution = 'auto' | 'equal' | 'red' | 'blue';

export interface Board {
  balls: Ball[];
  annotations: Annotation[];
  tieResolution: TieResolution;
}

export interface VariantNotes {
  /** 戦術名は Variant.name を使用 */
  aim: string;
  success: string;
  risk: string;
  memo: string;
  /** 相手の残り球（メモ） */
  opponentRemaining: string;
}

export interface Variant {
  id: string;
  name: string;
  parentId: string | null;
  board: Board;
  notes: VariantNotes;
  createdAt: string;
}

export interface HandCounts {
  /** null のときは未配置の球数を表示（実際の残数とはみなさない） */
  red: number | null;
  blue: number | null;
}
