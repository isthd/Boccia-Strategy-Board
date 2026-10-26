// 保存単位（シナリオ文書）の型と生成関数。
// 永続化する原本値のみを持ち、距離・暫定得点などの派生値は保存しない。

import type { Ball, Board, CourtConfig, HandCounts, MatchType, RuleProfileId, Side, Variant, VariantNotes } from './types';
import { BALL_RADIUS, DEFAULT_COURT } from './geometry';
import type { MatchState } from './match';

export const SCHEMA_VERSION = 1;

export interface BoardDoc {
  id: string;
  title: string;
  schemaVersion: number;
  profileId: RuleProfileId;
  mode: 'sandbox' | 'match';
  matchType: MatchType;
  court: CourtConfig;
  /** 自由配置の局面（A案・B案…）。試合再現では盤面は match.board */
  variants: Variant[];
  activeVariantId: string;
  handCounts: HandCounts;
  match: MatchState | null;
  /** 分岐元 */
  branchedFrom: { docId: string; variantId?: string; throwSeq?: number; title?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export function newId(prefix = ''): string {
  const c = globalThis.crypto as Crypto | undefined;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export const nowIso = () => new Date().toISOString();

export function makeJack(): Ball {
  return { id: 'jack', kind: 'jack', number: 0, x: 3, y: 5, radius: BALL_RADIUS, status: 'available' };
}

export function makeColorBall(side: Side, number: number, extra: Partial<Ball> = {}): Ball {
  return {
    id: `${side}-${number}`,
    kind: 'color',
    side,
    number,
    x: 0,
    y: 0,
    radius: BALL_RADIUS,
    status: 'available',
    ...extra,
  };
}

/** 初期パレット：ジャック1、赤6、青6 */
export function defaultBalls(): Ball[] {
  const balls: Ball[] = [makeJack()];
  for (const side of ['red', 'blue'] as Side[]) for (let i = 1; i <= 6; i++) balls.push(makeColorBall(side, i));
  return balls;
}

export function emptyBoard(balls: Ball[] = defaultBalls()): Board {
  return { balls, annotations: [], tieResolution: 'auto' };
}

export const emptyNotes = (): VariantNotes => ({ aim: '', success: '', risk: '', memo: '', opponentRemaining: '' });

export function newVariant(name: string, board: Board = emptyBoard(), parentId: string | null = null): Variant {
  return { id: newId('v'), name, parentId, board, notes: emptyNotes(), createdAt: nowIso() };
}

export function createSandboxDoc(profileId: RuleProfileId = 'standard-2021-2024-v2', title = '新しい盤面'): BoardDoc {
  const v = newVariant('A案');
  const t = nowIso();
  return {
    id: newId('doc'),
    title,
    schemaVersion: SCHEMA_VERSION,
    profileId,
    mode: 'sandbox',
    matchType: 'individual',
    court: { ...DEFAULT_COURT, cross: { ...DEFAULT_COURT.cross }, vLeft: { ...DEFAULT_COURT.vLeft }, vApex: { ...DEFAULT_COURT.vApex }, vRight: { ...DEFAULT_COURT.vRight } },
    variants: [v],
    activeVariantId: v.id,
    handCounts: { red: null, blue: null },
    match: null,
    branchedFrom: null,
    createdAt: t,
    updatedAt: t,
  };
}

export function activeVariant(doc: BoardDoc): Variant {
  return doc.variants.find((v) => v.id === doc.activeVariantId) ?? doc.variants[0];
}

/** 現在編集中の盤面 */
export function activeBoard(doc: BoardDoc): Board {
  if (doc.mode === 'match' && doc.match) return doc.match.board;
  return activeVariant(doc).board;
}

export const ballLabel = (b: Pick<Ball, 'kind' | 'side' | 'number'>): string =>
  b.kind === 'jack' ? 'ジャック' : `${b.side === 'red' ? '赤' : '青'}${b.number}`;

export const ballShortLabel = (b: Pick<Ball, 'kind' | 'side' | 'number'>): string =>
  b.kind === 'jack' ? 'J' : `${b.side === 'red' ? '赤' : '青'}${b.number}`;

export function cloneBoard(b: Board): Board {
  return JSON.parse(JSON.stringify(b)) as Board;
}
