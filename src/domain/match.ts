// 試合再現モードの状態遷移（純粋関数：入力の MatchState を変更せず新しい値を返す）。
// ボールをドラッグしただけでは投球数・持ち時間は減らない。recordColorThrow 等の確定操作でのみ記録する。

import type { Ball, Board, CourtConfig, MatchType, Side } from './types';
import { SIDES, otherSide, sideLabel } from './types';
import type { RuleProfile } from './rules/profile';
import { jackThrower, sideOfBox } from './rules/registry';
import { computeScore } from './scoring';
import { nextSide, type TurnDecision, type TurnInput } from './turn-engine';
import { isCircleInPlayingArea, jackAreaStatus, jackResetPosition } from './geometry';
import { makeColorBall, makeJack, newId, nowIso, ballLabel } from './document';

export interface PlayerSlot {
  box: number;
  side: Side;
  name: string;
}

export interface MatchSetup {
  matchType: MatchType;
  classCode: string | null;
  numEnds: number;
  timeSec: Record<Side, number>;
  redName: string;
  blueName: string;
  players: PlayerSlot[];
}

export type MatchPhase = 'jack' | 'color' | 'endScoring' | 'tiebreakSetup' | 'finished';
export type EndKind = 'regular' | 'tiebreak' | 'finalShot';

export interface PenaltyEntry {
  id: string;
  side: Side;
  result: 'pending' | 'in' | 'miss';
  note: string;
}

export interface EndRecord {
  kind: EndKind;
  /** 正規エンドは1始まりのエンド番号、タイブレイクは1始まりの回数 */
  no: number;
  jackSide: Side | null;
  jackBox: number | null;
  jackFouls: number;
  ballLimit: Record<Side, number>;
  computed: { red: number; blue: number } | null;
  override: { red: number; blue: number; reason: string } | null;
  penalties: PenaltyEntry[];
  /** エンド得点（ペナルティ加点込み）。確定後のみ */
  final: { red: number; blue: number } | null;
  confirmed: boolean;
  remainingSec: Record<Side, number | null>;
  /** タイブレイク／ファイナルショットの先攻 */
  firstSide: Side | null;
  /** ファイナルショット等で審判・主催者判断により勝者を確定した場合 */
  manualWinner: Side | null;
  manualWinnerReason: string;
}

export type ThrowKind = 'jack' | 'color' | 'bnp' | 'jackReset' | 'decision' | 'endConfirm' | 'penalty' | 'info';
export type ThrowResult =
  | 'valid'
  | 'out'
  | 'retracted'
  | 'BNP'
  | 'jackValid'
  | 'jackFoul'
  | 'jackReset'
  | 'penaltyIn'
  | 'penaltyMiss'
  | 'manual'
  | 'info';

export const THROW_RESULT_LABEL: Record<ThrowResult, string> = {
  valid: '有効',
  out: 'アウト',
  retracted: '反則除去',
  BNP: 'BNP（投球せず）',
  jackValid: 'ジャック有効',
  jackFoul: 'ジャックファウル',
  jackReset: 'ジャック再配置',
  penaltyIn: 'ペナルティ成功',
  penaltyMiss: 'ペナルティ失敗',
  manual: '手動判断',
  info: '記録',
};

export interface ThrowEvent {
  /** 投球順ID（球IDとは別） */
  id: string;
  seq: number;
  endIdx: number;
  kind: ThrowKind;
  side: Side | null;
  box: number | null;
  ballId: string | null;
  result: ThrowResult;
  durationSec: number | null;
  note: string;
  at: string;
  /** この記録の直後の盤面スナップショット（再生・分岐用） */
  boardAfter: Ball[];
  decision: { side: Side | null; reason: string; manual: boolean } | null;
}

export interface MatchState {
  setup: MatchSetup;
  phase: MatchPhase;
  currentEnd: number;
  ends: EndRecord[];
  throws: ThrowEvent[];
  board: Board;
  lastThrower: Side | null;
  jackResetBy: Side | null;
  /** 審判判断による次投球サイドの手動指定（次の記録で解除） */
  manualNextSide: { side: Side; reason: string } | null;
  /** ジャック担当の手動指定 */
  manualJackBox: number | null;
  /** 盤面に置いたが未記録の球 */
  pendingBallId: string | null;
  winner: Side | null;
  winnerReason: string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function boxesOf(profile: RuleProfile, matchType: MatchType, side: Side): number[] {
  const mt = profile.matchTypes[matchType];
  return side === 'red' ? mt.redBoxes : mt.blueBoxes;
}

export function defaultSetup(profile: RuleProfile, matchType: MatchType): MatchSetup {
  const mt = profile.matchTypes[matchType];
  const cls = profile.classes[matchType][0];
  const players: PlayerSlot[] = [];
  for (const side of SIDES) {
    boxesOf(profile, matchType, side).forEach((box, i) =>
      players.push({ box, side, name: `${sideLabel(side)}${mt.playersPerSide > 1 ? `選手${i + 1}` : '選手'}` }),
    );
  }
  return {
    matchType,
    classCode: cls.code,
    numEnds: mt.defaultEnds,
    timeSec: { red: cls.timeSec, blue: cls.timeSec },
    redName: '赤サイド',
    blueName: '青サイド',
    players: players.sort((a, b) => a.box - b.box),
  };
}

/** 試合用の球：ボックスごとに ballsPerPlayer 球を割り当てる */
export function createMatchBalls(profile: RuleProfile, setup: MatchSetup): Ball[] {
  const mt = profile.matchTypes[setup.matchType];
  const balls: Ball[] = [makeJack()];
  for (const side of SIDES) {
    let n = 1;
    for (const box of boxesOf(profile, setup.matchType, side)) {
      for (let i = 0; i < mt.ballsPerPlayer; i++) balls.push(makeColorBall(side, n++, { playerBox: box }));
    }
  }
  return balls;
}

export function totalBallsPerSide(profile: RuleProfile, matchType: MatchType): number {
  const mt = profile.matchTypes[matchType];
  return mt.ballsPerPlayer * mt.playersPerSide;
}

function newEnd(kind: EndKind, no: number, limit: number): EndRecord {
  return {
    kind,
    no,
    jackSide: null,
    jackBox: null,
    jackFouls: 0,
    ballLimit: { red: limit, blue: limit },
    computed: null,
    override: null,
    penalties: [],
    final: null,
    confirmed: false,
    remainingSec: { red: null, blue: null },
    firstSide: null,
    manualWinner: null,
    manualWinnerReason: '',
  };
}

function resetBalls(board: Board): void {
  for (const b of board.balls) {
    b.status = 'available';
    if (b.kind === 'jack') {
      b.x = 3;
      b.y = 5;
    }
  }
  board.tieResolution = 'auto';
}

export function createMatch(profile: RuleProfile, setup: MatchSetup): MatchState {
  const m: MatchState = {
    setup: clone(setup),
    phase: 'jack',
    currentEnd: 0,
    ends: [newEnd('regular', 1, totalBallsPerSide(profile, setup.matchType))],
    throws: [],
    board: { balls: createMatchBalls(profile, setup), annotations: [], tieResolution: 'auto' },
    lastThrower: null,
    jackResetBy: null,
    manualNextSide: null,
    manualJackBox: null,
    pendingBallId: null,
    winner: null,
    winnerReason: '',
  };
  return m;
}

export const currentEndRecord = (m: MatchState): EndRecord => m.ends[m.currentEnd];

export const regularEnds = (m: MatchState): EndRecord[] => m.ends.filter((e) => e.kind === 'regular');

/** 正規エンドの合計得点（タイブレイク・ファイナルショットは加算しない） */
export function totals(m: MatchState): Record<Side, number> {
  const t = { red: 0, blue: 0 };
  for (const e of regularEnds(m)) {
    if (e.final) {
      t.red += e.final.red;
      t.blue += e.final.blue;
    }
  }
  return t;
}

/** 現在のエンドで各サイドが投球したカラー球数 */
export function thrownThisEnd(m: MatchState): Record<Side, number> {
  const t = { red: 0, blue: 0 };
  for (const ev of m.throws) {
    if (ev.endIdx === m.currentEnd && ev.kind === 'color' && ev.side) t[ev.side]++;
  }
  return t;
}

export function availableBalls(m: MatchState, side: Side, box?: number | null): Ball[] {
  return m.board.balls.filter(
    (b) => b.kind === 'color' && b.side === side && b.status === 'available' && b.id !== m.pendingBallId && (box == null || b.playerBox === box),
  );
}

/** 残り投球数（未記録の仮置き球も手持ちに含める） */
export function remainingThrows(m: MatchState): Record<Side, number> {
  const end = currentEndRecord(m);
  const thrown = thrownThisEnd(m);
  const r = { red: 0, blue: 0 };
  for (const s of SIDES) {
    const inHand = m.board.balls.filter((b) => b.kind === 'color' && b.side === s && (b.status === 'available' || b.id === m.pendingBallId)).length;
    r[s] = Math.max(0, Math.min(inHand, end.ballLimit[s] - thrown[s]));
  }
  return r;
}

/** 選手（ボックス）ごとの手持ち球数 */
export function remainingByBox(m: MatchState): Record<number, number> {
  const res: Record<number, number> = {};
  for (const b of m.board.balls) {
    if (b.kind !== 'color' || b.playerBox == null) continue;
    res[b.playerBox] = (res[b.playerBox] ?? 0) + (b.status === 'available' || b.id === m.pendingBallId ? 1 : 0);
  }
  return res;
}

export function currentJackThrower(m: MatchState, profile: RuleProfile) {
  const end = currentEndRecord(m);
  if (m.manualJackBox != null) {
    return {
      box: m.manualJackBox,
      side: sideOfBox(profile, m.setup.matchType, m.manualJackBox),
      manualRequired: false,
      reason: '審判・主催者判断により手動で指定',
      ruleRef: profile.refs.jackFoul,
      provisional: false,
    };
  }
  const regIdx = m.ends.slice(0, m.currentEnd + 1).filter((e) => e.kind === 'regular').length - 1;
  return jackThrower(profile, m.setup.matchType, regIdx, m.setup.numEnds, end.jackFouls);
}

export function turnInput(m: MatchState, court: CourtConfig): TurnInput {
  return {
    balls: m.board.balls,
    court,
    remaining: remainingThrows(m),
    thrown: thrownThisEnd(m),
    lastThrower: m.lastThrower,
    jackSide: currentEndRecord(m).jackSide,
    jackResetBy: m.jackResetBy,
    tieResolution: m.board.tieResolution,
  };
}

/** 次投球サイド（手動指定があれば優先） */
export function decideNext(m: MatchState, court: CourtConfig, profile: RuleProfile): TurnDecision {
  const d = nextSide(turnInput(m, court), profile);
  if (m.manualNextSide && !d.endComplete) {
    return { ...d, side: m.manualNextSide.side, manualRequired: false, reason: `手動指定：${m.manualNextSide.reason || '審判判断'}（自動判定：${d.reason}）` };
  }
  return d;
}

function pushEvent(m: MatchState, ev: Omit<ThrowEvent, 'id' | 'seq' | 'at' | 'boardAfter' | 'endIdx' | 'decision'>, decision: TurnDecision | null): void {
  m.throws.push({
    ...ev,
    id: newId('t'),
    seq: m.throws.length + 1,
    endIdx: m.currentEnd,
    at: nowIso(),
    boardAfter: clone(m.board.balls),
    decision: decision ? { side: decision.side, reason: decision.reason, manual: decision.manualRequired } : null,
  });
}

export interface JackRecordInput {
  result: 'valid' | 'foul';
  box: number | null;
  note: string;
  durationSec: number | null;
}

/** ジャック投球の記録 */
export function recordJack(src: MatchState, court: CourtConfig, profile: RuleProfile, input: JackRecordInput): MatchState {
  const m = clone(src);
  const end = currentEndRecord(m);
  const jack = m.board.balls.find((b) => b.kind === 'jack')!;
  const side = input.box != null ? sideOfBox(profile, m.setup.matchType, input.box) : null;
  if (input.result === 'valid') {
    jack.status = 'inPlay';
    end.jackSide = side;
    end.jackBox = input.box;
    m.phase = 'color';
    m.manualJackBox = null;
    pushEvent(m, { kind: 'jack', side, box: input.box, ballId: jack.id, result: 'jackValid', durationSec: input.durationSec, note: input.note }, null);
    const d = decideNext(m, court, profile);
    m.throws[m.throws.length - 1].decision = { side: d.side, reason: d.reason, manual: d.manualRequired };
  } else {
    jack.status = 'available';
    jack.x = court.cross.x;
    jack.y = court.cross.y;
    end.jackFouls += 1;
    m.manualJackBox = null;
    pushEvent(m, { kind: 'jack', side, box: input.box, ballId: jack.id, result: 'jackFoul', durationSec: input.durationSec, note: input.note }, null);
  }
  return m;
}

/** 記録前の自動チェック：ジャック位置 */
export function jackCheck(m: MatchState, court: CourtConfig) {
  const jack = m.board.balls.find((b) => b.kind === 'jack')!;
  return { onCourt: jack.status !== 'available', area: jackAreaStatus(jack, jack.radius, court) };
}

export interface ColorRecordInput {
  side: Side;
  box: number | null;
  result: 'valid' | 'out' | 'retracted';
  note: string;
  durationSec: number | null;
  /** 同時にアウトとする球（弾き出された球など） */
  markOutIds: string[];
  /** ジャックがプレイングエリア外／無効エリアに弾き出された → クロスへ再配置 */
  resetJack: boolean;
}

export interface ColorRecordOutcome {
  match: MatchState;
  warnings: string[];
}

/** 投球中に盤面で弾き出された球の候補（位置がエリア外のプレイ中の球） */
export function autoOutCandidates(m: MatchState, court: CourtConfig, excludeId: string | null): Ball[] {
  return m.board.balls.filter(
    (b) => b.kind === 'color' && b.status === 'inPlay' && b.id !== excludeId && !isCircleInPlayingArea(b, b.radius, court),
  );
}

/** カラー球1投の記録（「この状態を1投として記録」） */
export function recordColorThrow(src: MatchState, court: CourtConfig, profile: RuleProfile, input: ColorRecordInput): ColorRecordOutcome {
  const m = clone(src);
  const warnings: string[] = [];
  const balls = m.board.balls;
  let ball: Ball | undefined = m.pendingBallId ? balls.find((b) => b.id === m.pendingBallId) : undefined;
  if (ball && ball.side !== input.side) {
    // 仮置き球のサイドと記録サイドが違う → 仮置きを手持ちに戻す
    ball.status = 'available';
    ball = undefined;
  }
  // 選手（ボックス）の球に揃える
  if (ball && input.box != null && ball.playerBox !== input.box) {
    const alt = availableBalls(m, input.side, input.box)[0];
    if (alt) {
      alt.x = ball.x;
      alt.y = ball.y;
      alt.status = ball.status;
      ball.status = 'available';
      ball = alt;
    }
  }
  if (!ball) {
    ball = availableBalls(m, input.side, input.box)[0] ?? availableBalls(m, input.side)[0];
    if (ball && input.result === 'valid') {
      warnings.push('盤面に投球位置が置かれていないため、球をコート中央付近に置きました。位置を調整してください。');
      ball.x = court.width / 2;
      ball.y = court.playingLength * 0.75;
    }
  }
  if (!ball) {
    return { match: src, warnings: [`${sideLabel(input.side)}に投球できる球が残っていません。`] };
  }
  ball.status = input.result === 'valid' ? 'inPlay' : input.result === 'out' ? 'out' : 'retracted';
  if (input.result === 'valid' && !isCircleInPlayingArea(ball, ball.radius, court)) {
    warnings.push(`${ballLabel(ball)}の位置がプレイングエリア外です。アウトの可能性があります。`);
  }
  for (const id of input.markOutIds) {
    const b = balls.find((x) => x.id === id);
    if (b && b.kind === 'color') b.status = 'out';
  }
  m.jackResetBy = null;
  if (input.resetJack) {
    const jack = balls.find((b) => b.kind === 'jack')!;
    const r = jackResetPosition(court, balls, jack.radius, profile.occupiedCrossRule);
    jack.x = r.position.x;
    jack.y = r.position.y;
    jack.status = 'inPlay';
    m.jackResetBy = input.side;
    if (r.kind === 'manual') warnings.push(r.reason);
    else if (r.kind === 'frontOfCross') warnings.push('クロス上に球があるため、クロスの前面（スローイングライン側）中央に置き直しました（通常版 §10.11.2）。');
  }
  m.lastThrower = input.side;
  m.pendingBallId = null;
  m.manualNextSide = null;
  pushEvent(m, { kind: 'color', side: input.side, box: input.box ?? ball.playerBox ?? null, ballId: ball.id, result: input.result, durationSec: input.durationSec, note: input.note }, null);
  if (input.resetJack) {
    m.throws[m.throws.length - 1].note = [m.throws[m.throws.length - 1].note, 'ジャックをクロスへ再配置'].filter(Boolean).join(' / ');
  }
  const d = decideNext(m, court, profile);
  m.throws[m.throws.length - 1].decision = { side: d.side, reason: d.reason, manual: d.manualRequired };
  if (d.endComplete) toScoring(m, court);
  return { match: m, warnings };
}

function toScoring(m: MatchState, court: CourtConfig): void {
  m.phase = 'endScoring';
  const s = computeScore(m.board.balls, court, m.board.tieResolution);
  currentEndRecord(m).computed = { red: s.red, blue: s.blue };
}

/** 残りの球を投球しない（BNP）申告 */
export function declareBNP(src: MatchState, court: CourtConfig, profile: RuleProfile, side: Side, note: string): MatchState {
  const m = clone(src);
  const end = currentEndRecord(m);
  if (m.pendingBallId) {
    const p = m.board.balls.find((b) => b.id === m.pendingBallId);
    if (p && p.side === side) {
      p.status = 'available';
      m.pendingBallId = null;
    }
  }
  const rem = remainingThrows(m)[side];
  let n = 0;
  for (const b of m.board.balls) {
    if (b.kind === 'color' && b.side === side && b.status === 'available' && n < rem) {
      b.status = 'BNP';
      n++;
    }
  }
  // ballLimit を投球済み数に揃え、残り0とする
  end.ballLimit[side] = thrownThisEnd(m)[side];
  m.manualNextSide = null;
  pushEvent(m, { kind: 'bnp', side, box: null, ballId: null, result: 'BNP', durationSec: null, note: note || `${sideLabel(side)}が残り${n}球を投球しないと申告` }, null);
  const d = decideNext(m, court, profile);
  m.throws[m.throws.length - 1].decision = { side: d.side, reason: d.reason, manual: d.manualRequired };
  if (d.endComplete) toScoring(m, court);
  return m;
}

/** 審判判断による次サイドの手動指定（理由をログに残す） */
export function setManualNextSide(src: MatchState, side: Side, reason: string): MatchState {
  const m = clone(src);
  m.manualNextSide = { side, reason };
  pushEvent(m, { kind: 'decision', side, box: null, ballId: null, result: 'manual', durationSec: null, note: `次投球サイドを${sideLabel(side)}に手動指定：${reason || '審判判断'}` }, null);
  return m;
}

export function setManualJackBox(src: MatchState, box: number, reason: string): MatchState {
  const m = clone(src);
  m.manualJackBox = box;
  pushEvent(m, { kind: 'decision', side: null, box, ballId: null, result: 'manual', durationSec: null, note: `ジャック担当を${box}番ボックスに手動指定：${reason || '審判・主催者判断'}` }, null);
  return m;
}

/** 手動でジャックをクロスへ再配置（盤面操作後の補正用） */
export function manualJackReset(src: MatchState, court: CourtConfig, profile: RuleProfile, bySide: Side | null): { match: MatchState; warning: string | null } {
  const m = clone(src);
  const jack = m.board.balls.find((b) => b.kind === 'jack')!;
  const r = jackResetPosition(court, m.board.balls, jack.radius, profile.occupiedCrossRule);
  jack.x = r.position.x;
  jack.y = r.position.y;
  jack.status = 'inPlay';
  m.jackResetBy = bySide;
  pushEvent(m, { kind: 'jackReset', side: bySide, box: null, ballId: jack.id, result: 'jackReset', durationSec: null, note: r.kind === 'manual' ? r.reason : 'ジャックをクロスへ再配置' }, null);
  return { match: m, warning: r.kind === 'manual' ? r.reason : null };
}

export function addPenalty(src: MatchState, side: Side): MatchState {
  const m = clone(src);
  currentEndRecord(m).penalties.push({ id: newId('p'), side, result: 'pending', note: '' });
  return m;
}

export function setPenaltyResult(src: MatchState, id: string, result: PenaltyEntry['result']): MatchState {
  const m = clone(src);
  const p = currentEndRecord(m).penalties.find((x) => x.id === id);
  if (p) p.result = result;
  return m;
}

export function removePenalty(src: MatchState, id: string): MatchState {
  const m = clone(src);
  const e = currentEndRecord(m);
  e.penalties = e.penalties.filter((p) => p.id !== id);
  return m;
}

export interface ConfirmEndInput {
  override: { red: number; blue: number; reason: string } | null;
  remainingSec: Record<Side, number | null>;
  /** ファイナルショット等で同距離のときの勝者（主催者・審判判断） */
  manualWinner?: { side: Side; reason: string } | null;
}

export interface ConfirmEndOutcome {
  match: MatchState;
  error?: string;
}

/** エンド得点の確定と次エンド／タイブレイク／試合終了への遷移 */
export function confirmEnd(src: MatchState, court: CourtConfig, profile: RuleProfile, input: ConfirmEndInput): ConfirmEndOutcome {
  const m = clone(src);
  const end = currentEndRecord(m);
  const s = computeScore(m.board.balls, court, m.board.tieResolution);
  end.computed = { red: s.red, blue: s.blue };
  end.override = input.override;
  end.remainingSec = input.remainingSec;
  const base = input.override ? { red: input.override.red, blue: input.override.blue } : { ...end.computed };
  if (profile.penaltyBalls && end.kind !== 'finalShot') {
    if (end.penalties.some((p) => p.result === 'pending')) return { match: src, error: '結果が未確定のペナルティボールがあります。' };
    for (const p of end.penalties) if (p.result === 'in') base[p.side] += 1;
  }
  end.final = base;
  end.confirmed = true;

  const note =
    `第${end.no}${end.kind === 'regular' ? 'エンド' : end.kind === 'tiebreak' ? '回タイブレイク' : '回ファイナルショット'}確定 赤${base.red}–青${base.blue}` +
    (input.override ? `（手動修正：${input.override.reason || '理由未記入'}／計算値 赤${end.computed.red}–青${end.computed.blue}）` : '');
  pushEvent(m, { kind: 'endConfirm', side: null, box: null, ballId: null, result: 'info', durationSec: null, note }, null);

  if (end.kind === 'regular') {
    const regCount = regularEnds(m).length;
    if (regCount < m.setup.numEnds) {
      startNextRegularEnd(m, profile);
    } else {
      const t = totals(m);
      if (t.red !== t.blue) finish(m, t.red > t.blue ? 'red' : 'blue', `合計 赤${t.red}–青${t.blue}`);
      else {
        m.phase = 'tiebreakSetup';
      }
    }
    return { match: m };
  }

  // タイブレイク／ファイナルショット
  let winner: Side | null = null;
  let reason = '';
  if (input.manualWinner) {
    winner = input.manualWinner.side;
    reason = `${profile.tieBreak.label}：主催者・審判判断（${input.manualWinner.reason || '理由未記入'}）`;
    end.manualWinner = winner;
    end.manualWinnerReason = input.manualWinner.reason;
  } else if (base.red !== base.blue) {
    winner = base.red > base.blue ? 'red' : 'blue';
    reason = `${profile.tieBreak.label} 赤${base.red}–青${base.blue}`;
  }
  if (winner) {
    finish(m, winner, reason);
    return { match: m };
  }
  if (end.kind === 'finalShot') {
    // フレンドリー版本文にはファイナルショット同点時の規定がない
    m.phase = 'tiebreakSetup';
    return { match: m };
  }
  // 通常版 §13.6：前回後攻だったサイドのジャックで次のタイブレイク
  const nextFirst = end.firstSide ? otherSide(end.firstSide) : 'red';
  startTiebreakInPlace(m, court, profile, nextFirst);
  return { match: m };
}

function finish(m: MatchState, winner: Side, reason: string) {
  m.phase = 'finished';
  m.winner = winner;
  m.winnerReason = reason;
  pushEvent(m, { kind: 'info', side: winner, box: null, ballId: null, result: 'info', durationSec: null, note: `試合終了：${sideLabel(winner)}の勝ち（${reason}）` }, null);
}

function startNextRegularEnd(m: MatchState, profile: RuleProfile) {
  const no = regularEnds(m).length + 1;
  m.ends.push(newEnd('regular', no, totalBallsPerSide(profile, m.setup.matchType)));
  m.currentEnd = m.ends.length - 1;
  resetBalls(m.board);
  m.phase = 'jack';
  m.lastThrower = null;
  m.jackResetBy = null;
  m.manualNextSide = null;
  m.manualJackBox = null;
  m.pendingBallId = null;
}

function startTiebreakInPlace(m: MatchState, court: CourtConfig, profile: RuleProfile, firstSide: Side) {
  const kind: EndKind = profile.tieBreak.kind === 'finalShot' ? 'finalShot' : 'tiebreak';
  const no = m.ends.filter((e) => e.kind === kind).length + 1;
  const limit = profile.tieBreak.kind === 'finalShot' ? profile.tieBreak.ballsPerSide : totalBallsPerSide(profile, m.setup.matchType);
  const end = newEnd(kind, no, limit);
  end.firstSide = firstSide;
  end.jackSide = firstSide;
  m.ends.push(end);
  m.currentEnd = m.ends.length - 1;
  resetBalls(m.board);
  const jack = m.board.balls.find((b) => b.kind === 'jack')!;
  jack.x = court.cross.x;
  jack.y = court.cross.y;
  jack.status = 'inPlay';
  m.phase = 'color';
  m.lastThrower = null;
  m.jackResetBy = null;
  m.manualNextSide = null;
  m.manualJackBox = null;
  m.pendingBallId = null;
  pushEvent(
    m,
    { kind: 'info', side: firstSide, box: null, ballId: jack.id, result: 'info', durationSec: null, note: `${profile.tieBreak.label}${no}回目開始：先攻${sideLabel(firstSide)}のジャックをクロスに配置` },
    null,
  );
}

/** タイブレイク開始（コイントスの結果、先攻サイドを指定） */
export function startTiebreak(src: MatchState, court: CourtConfig, profile: RuleProfile, firstSide: Side): MatchState {
  const m = clone(src);
  startTiebreakInPlace(m, court, profile, firstSide);
  return m;
}

/** ファイナルショット等で決着しない場合の主催者判断による勝者確定 */
export function decideWinnerManually(src: MatchState, side: Side, reason: string): MatchState {
  const m = clone(src);
  finish(m, side, `主催者・審判判断：${reason || '理由未記入'}`);
  return m;
}
