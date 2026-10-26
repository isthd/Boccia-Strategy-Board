// JSON入出力のバリデーションと版移行。
import { z } from 'zod';
import type { BoardDoc } from '../domain/document';
import { SCHEMA_VERSION, newId, nowIso } from '../domain/document';

const finite = z.number().finite();
/** 座標範囲：コート外の余白を含め -2〜15m の範囲のみ受け付ける */
const coordX = finite.min(-2).max(10);
const coordY = finite.min(-2).max(15);
const side = z.enum(['red', 'blue']);
const vec = z.object({ x: coordX, y: coordY });

export const ballSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['jack', 'color']),
  side: side.optional(),
  number: z.number().int().min(0).max(99),
  x: coordX,
  y: coordY,
  radius: finite.min(0.01).max(0.2),
  status: z.enum(['available', 'inPlay', 'out', 'retracted', 'BNP', 'penalty']),
  unofficial: z.boolean().optional(),
  playerBox: z.number().int().min(1).max(6).optional(),
});

const annotationSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('target'),
    x: coordX,
    y: coordY,
    name: z.string().max(200),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    memo: z.string().max(5000),
    color: z.string().max(32),
  }),
  z.object({
    id: z.string(),
    type: z.literal('arrow'),
    from: vec,
    fromBox: z.number().int().min(1).max(6).nullable(),
    to: vec,
    name: z.string().max(200),
    color: z.string().max(32),
    tags: z.array(z.enum(['approach', 'push', 'moveJack', 'block', 'other'])),
    memo: z.string().max(5000),
  }),
  z.object({
    id: z.string(),
    type: z.literal('text'),
    x: coordX,
    y: coordY,
    text: z.string().max(2000),
    color: z.string().max(32),
  }),
]);

const boardSchema = z
  .object({
    balls: z.array(ballSchema).max(60),
    annotations: z.array(annotationSchema).max(500),
    tieResolution: z.enum(['auto', 'equal', 'red', 'blue']),
  })
  .superRefine((b, ctx) => {
    const ids = new Set<string>();
    for (const ball of b.balls) {
      if (ids.has(ball.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `球IDが重複しています: ${ball.id}` });
      ids.add(ball.id);
      if (ball.kind === 'color' && !ball.side) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `カラー球にサイドがありません: ${ball.id}` });
    }
    if (b.balls.filter((x) => x.kind === 'jack').length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ジャックが複数あります' });
  });

const courtSchema = z.object({
  width: finite.min(1).max(10),
  length: finite.min(2).max(15),
  playingLength: finite.min(1).max(14),
  boxCount: z.number().int().min(1).max(6),
  cross: vec,
  vLeft: vec,
  vApex: vec,
  vRight: vec,
  targetBoxSize: finite.min(0).max(1),
  thickLine: finite.min(0).max(0.1),
  thinLine: finite.min(0).max(0.1),
  custom: z.boolean(),
  customNote: z.string().max(2000),
});

const variantSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  parentId: z.string().nullable(),
  board: boardSchema,
  notes: z.object({
    aim: z.string(),
    success: z.string(),
    risk: z.string(),
    memo: z.string(),
    opponentRemaining: z.string(),
  }),
  createdAt: z.string(),
});

const sideRecord = <T extends z.ZodTypeAny>(t: T) => z.object({ red: t, blue: t });

const matchSchema = z.object({
  setup: z.object({
    matchType: z.enum(['individual', 'pair', 'team']),
    classCode: z.string().nullable(),
    numEnds: z.number().int().min(1).max(20),
    timeSec: sideRecord(finite.min(0).max(7200)),
    redName: z.string(),
    blueName: z.string(),
    players: z.array(z.object({ box: z.number().int().min(1).max(6), side, name: z.string() })),
  }),
  phase: z.enum(['jack', 'color', 'endScoring', 'tiebreakSetup', 'finished']),
  currentEnd: z.number().int().min(0),
  ends: z.array(
    z.object({
      kind: z.enum(['regular', 'tiebreak', 'finalShot']),
      no: z.number().int(),
      jackSide: side.nullable(),
      jackBox: z.number().int().nullable(),
      jackFouls: z.number().int().min(0),
      ballLimit: sideRecord(z.number().int().min(0)),
      computed: sideRecord(z.number().int()).nullable(),
      override: z.object({ red: z.number().int(), blue: z.number().int(), reason: z.string() }).nullable(),
      penalties: z.array(z.object({ id: z.string(), side, result: z.enum(['pending', 'in', 'miss']), note: z.string() })),
      final: sideRecord(z.number().int()).nullable(),
      confirmed: z.boolean(),
      remainingSec: sideRecord(finite.nullable()),
      firstSide: side.nullable(),
      manualWinner: side.nullable(),
      manualWinnerReason: z.string(),
    }),
  ).min(1),
  throws: z.array(
    z.object({
      id: z.string(),
      seq: z.number().int(),
      endIdx: z.number().int().min(0),
      kind: z.enum(['jack', 'color', 'bnp', 'jackReset', 'decision', 'endConfirm', 'penalty', 'info']),
      side: side.nullable(),
      box: z.number().int().nullable(),
      ballId: z.string().nullable(),
      result: z.enum(['valid', 'out', 'retracted', 'BNP', 'jackValid', 'jackFoul', 'jackReset', 'penaltyIn', 'penaltyMiss', 'manual', 'info']),
      durationSec: finite.nullable(),
      note: z.string(),
      at: z.string(),
      boardAfter: z.array(ballSchema),
      decision: z.object({ side: side.nullable(), reason: z.string(), manual: z.boolean() }).nullable(),
    }),
  ),
  board: boardSchema,
  lastThrower: side.nullable(),
  jackResetBy: side.nullable(),
  manualNextSide: z.object({ side, reason: z.string() }).nullable(),
  manualJackBox: z.number().int().nullable(),
  pendingBallId: z.string().nullable(),
  winner: side.nullable(),
  winnerReason: z.string(),
});

export const docSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().max(200),
    schemaVersion: z.number().int(),
    profileId: z.enum(['standard-2021-2024-v2', 'friendly-v2']),
    mode: z.enum(['sandbox', 'match']),
    matchType: z.enum(['individual', 'pair', 'team']),
    court: courtSchema,
    variants: z.array(variantSchema).min(1).max(100),
    activeVariantId: z.string(),
    handCounts: z.object({ red: z.number().int().min(0).max(99).nullable(), blue: z.number().int().min(0).max(99).nullable() }),
    match: matchSchema.nullable(),
    branchedFrom: z
      .object({ docId: z.string(), variantId: z.string().optional(), throwSeq: z.number().optional(), title: z.string().optional() })
      .nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === 'match' && !d.match) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '試合再現データ（match）がありません' });
    if (d.match && d.match.currentEnd >= d.match.ends.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'currentEnd が範囲外です' });
  });

export const EXPORT_FORMAT = 'boccia-strategy-board';

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  appVersion: string;
  doc: BoardDoc;
}

export function toExportJson(doc: BoardDoc): string {
  const f: ExportFile = { format: EXPORT_FORMAT, exportedAt: nowIso(), appVersion: '1.0.0', doc };
  return JSON.stringify(f, null, 2);
}

/** 旧版データの移行。現時点では版1のみ。将来の版追加時にここへ移行処理を足す。 */
export function migrate(raw: Record<string, unknown>): { data: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  const v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  const data = { ...raw };
  if (v === 0) {
    data.schemaVersion = 1;
    notes.push('版番号のないデータを版1として読み込みました。');
  }
  return { data, notes };
}

export type ImportResult = { ok: true; doc: BoardDoc; notes: string[] } | { ok: false; errors: string[] };

export function parseImport(text: string, opts: { newIdOnImport?: boolean } = {}): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSONとして読み込めません。'] };
  }
  if (!json || typeof json !== 'object') return { ok: false, errors: ['データ形式が不正です。'] };
  const obj = json as Record<string, unknown>;
  let rawDoc: unknown = obj;
  if (obj.format === EXPORT_FORMAT) rawDoc = obj.doc;
  if (!rawDoc || typeof rawDoc !== 'object') return { ok: false, errors: ['盤面データ（doc）がありません。'] };
  const ver = (rawDoc as Record<string, unknown>).schemaVersion;
  if (typeof ver === 'number' && ver > SCHEMA_VERSION) {
    return { ok: false, errors: [`このアプリより新しい版（schemaVersion ${ver}）のデータです。アプリを更新してください。`] };
  }
  const { data, notes } = migrate(rawDoc as Record<string, unknown>);
  const r = docSchema.safeParse(data);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const doc = r.data as BoardDoc;
  if (opts.newIdOnImport) {
    doc.id = newId('doc');
    doc.updatedAt = nowIso();
  }
  return { ok: true, doc, notes };
}
