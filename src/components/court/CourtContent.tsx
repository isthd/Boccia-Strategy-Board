// コートと盤面の描画（ワールド座標＝メートル）。操作ロジックを持たない純粋な描画。
import { memo } from 'react';
import type { Annotation, ArrowAnnotation, Ball, Board, CourtConfig, Vec } from '../../domain/types';
import { arrowAngleDeg, boxCenter, contactCandidates, distance, isCircleInPlayingArea, jackAreaStatus } from '../../domain/geometry';
import type { ScoreResult } from '../../domain/scoring';
import { ballShortLabel } from '../../domain/document';
import { fmtCm } from '../../domain/numeric';

export const PALETTE = {
  floor: '#8fa7bd',
  box: '#7f97ad',
  invalid: '#71889e',
  line: '#ffffff',
  outside: '#5b6f82',
  red: '#d62828',
  redStroke: '#7a1010',
  blue: '#1d4ed8',
  blueStroke: '#0b2470',
  jack: '#ffffff',
  jackStroke: '#1f2937',
  select: '#facc15',
  warn: '#f97316',
  danger: '#ef4444',
  contact: '#fde047',
  dist: '#0f172a',
  grid: 'rgba(255,255,255,0.28)',
  label: '#0f172a',
};

export interface CourtContentProps {
  court: CourtConfig;
  board: Board;
  /** 1mあたりの画面ピクセル（文字・線を画面上で一定の太さにするため） */
  pxPerM: number;
  showTargetBox: boolean;
  showNumbers: boolean;
  showGrid: boolean;
  ballOpacity: number;
  showDistances: boolean;
  showHalo: boolean;
  showContacts: boolean;
  showInvalidArea: boolean;
  showAnnotations?: boolean;
  showDimensions?: boolean;
  selectedId?: string | null;
  pendingId?: string | null;
  score: ScoreResult;
  overlapIds?: Set<string>;
  measure?: Vec[];
  arrowStart?: Vec | null;
}

const ballFill = (b: Ball) => (b.kind === 'jack' ? PALETTE.jack : b.side === 'red' ? PALETTE.red : PALETTE.blue);
const ballStroke = (b: Ball) => (b.kind === 'jack' ? PALETTE.jackStroke : b.side === 'red' ? PALETTE.redStroke : PALETTE.blueStroke);

export function CourtLines({ court, px, showTargetBox, showGrid, showInvalidArea, showDimensions }: {
  court: CourtConfig;
  px: (n: number) => number;
  showTargetBox: boolean;
  showGrid: boolean;
  showInvalidArea: boolean;
  showDimensions?: boolean;
}) {
  const { width: W, length: L, playingLength: P, thickLine: T, thinLine: t, vLeft, vApex, vRight } = court;
  const bw = W / court.boxCount;
  // Vラインのテープ：有効側の縁から無効側（+y）へ太線幅ぶん（法線方向の幅を縦方向に換算）
  const segT = (a: Vec, b: Vec) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return T / Math.max(0.2, Math.abs(Math.cos(ang)));
  };
  const tL = segT(vLeft, vApex);
  const tR = segT(vApex, vRight);
  const vTape = `${vLeft.x},${vLeft.y} ${vApex.x},${vApex.y} ${vRight.x},${vRight.y} ${vRight.x},${vRight.y + tR} ${vApex.x},${vApex.y + Math.max(tL, tR)} ${vLeft.x},${vLeft.y + tL}`;
  const invalidPoly = `${vLeft.x},${vLeft.y} ${vApex.x},${vApex.y} ${vRight.x},${vRight.y} ${W},${P} 0,${P}`;
  const crossHalf = 0.35 / 2;
  const tb = court.targetBoxSize;
  const fs = px(11);
  return (
    <g>
      <rect x={-0.6} y={-0.6} width={W + 1.2} height={L + 1.2} fill={PALETTE.outside} />
      {/* 外枠テープは内側の縁を基準に外側へ */}
      <rect x={-T} y={-T} width={W + 2 * T} height={L + 2 * T} fill={PALETTE.line} />
      <rect x={0} y={0} width={W} height={P} fill={PALETTE.floor} />
      <rect x={0} y={P} width={W} height={L - P} fill={PALETTE.box} />
      {showInvalidArea && <polygon points={invalidPoly} fill={PALETTE.invalid} />}
      {showGrid && (
        <g stroke={PALETTE.grid} strokeWidth={px(1)}>
          {Array.from({ length: Math.floor(W / 0.5) - 1 }, (_, i) => (i + 1) * 0.5).map((x) => (
            <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={P} />
          ))}
          {Array.from({ length: Math.floor(P / 0.5) - 1 }, (_, i) => (i + 1) * 0.5).map((y) => (
            <line key={`gy${y}`} x1={0} y1={y} x2={W} y2={y} />
          ))}
        </g>
      )}
      {/* スローイングライン（ボックス側の縁が y=P、テープはプレイングエリア側） */}
      <rect x={0} y={P - T} width={W} height={T} fill={PALETTE.line} />
      <polygon points={vTape} fill={PALETTE.line} />
      {/* ボックス区切り（細線、中心が規定位置） */}
      {Array.from({ length: court.boxCount - 1 }, (_, i) => (i + 1) * bw).map((x) => (
        <rect key={`bx${x}`} x={x - t / 2} y={P} width={t} height={L - P} fill={PALETTE.line} />
      ))}
      {/* クロス */}
      <rect x={court.cross.x - crossHalf} y={court.cross.y - t / 2} width={crossHalf * 2} height={t} fill={PALETTE.line} />
      <rect x={court.cross.x - t / 2} y={court.cross.y - crossHalf} width={t} height={crossHalf * 2} fill={PALETTE.line} />
      {showTargetBox && (
        <rect
          x={court.cross.x - tb / 2 - t / 2}
          y={court.cross.y - tb / 2 - t / 2}
          width={tb + t}
          height={tb + t}
          fill="none"
          stroke={PALETTE.line}
          strokeWidth={t}
          strokeDasharray={`${px(4)} ${px(3)}`}
        />
      )}
      {Array.from({ length: court.boxCount }, (_, i) => i + 1).map((n) => {
        const c = boxCenter(court, n);
        return (
          <text key={`bn${n}`} x={c.x} y={c.y + 0.25} fontSize={Math.max(fs * 1.4, 0.22)} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontWeight={700}>
            {n}
          </text>
        );
      })}
      {showDimensions && (
        <g fill="#e2e8f0" fontSize={0.22} textAnchor="middle">
          <text x={W / 2} y={-0.2}>{`${W.toFixed(2)}m`}</text>
          <text x={-0.3} y={P / 2} transform={`rotate(-90 ${-0.3} ${P / 2})`}>{`プレイングエリア ${P.toFixed(2)}m`}</text>
          <text x={W + 0.35} y={L / 2} transform={`rotate(90 ${W + 0.35} ${L / 2})`}>{`${L.toFixed(2)}m`}</text>
          <text x={W / 2} y={L + 0.38}>{`スローイングボックス 各${bw.toFixed(2)}m × ${(L - P).toFixed(2)}m`}</text>
        </g>
      )}
    </g>
  );
}

function ArrowShape({ a, px, balls, showContacts, selected }: { a: ArrowAnnotation; px: (n: number) => number; balls: Ball[]; showContacts: boolean; selected: boolean }) {
  const len = distance(a.from, a.to);
  const ang = arrowAngleDeg(a.from, a.to);
  const head = px(12);
  const ux = (a.to.x - a.from.x) / (len || 1);
  const uy = (a.to.y - a.from.y) / (len || 1);
  const hx = a.to.x - ux * head;
  const hy = a.to.y - uy * head;
  const nx = -uy * head * 0.5;
  const ny = ux * head * 0.5;
  const mid = { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 };
  const contacts = showContacts ? contactCandidates(a.from, a.to, balls.find((b) => b.kind === 'color')?.radius ?? 0.043, balls) : [];
  return (
    <g>
      {selected && <line x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} stroke={PALETTE.select} strokeWidth={px(7)} strokeLinecap="round" opacity={0.6} />}
      <line x1={a.from.x} y1={a.from.y} x2={hx} y2={hy} stroke={a.color} strokeWidth={px(3)} strokeLinecap="round" />
      <polygon points={`${a.to.x},${a.to.y} ${hx + nx},${hy + ny} ${hx - nx},${hy - ny}`} fill={a.color} />
      <circle cx={a.from.x} cy={a.from.y} r={px(4)} fill={a.color} />
      {contacts.map((c) => {
        const b = balls.find((x) => x.id === c.ballId)!;
        return <circle key={c.ballId} cx={b.x} cy={b.y} r={b.radius + px(5)} fill="none" stroke={PALETTE.contact} strokeWidth={px(2.5)} strokeDasharray={`${px(3)} ${px(2)}`} />;
      })}
      <text x={mid.x + px(8)} y={mid.y} fontSize={px(11)} fill={PALETTE.label} stroke="#fff" strokeWidth={px(3)} paintOrder="stroke">
        {`${a.name ? a.name + ' ' : ''}${len.toFixed(2)}m ${ang >= 0 ? '+' : ''}${ang.toFixed(1)}°`}
      </text>
    </g>
  );
}

function AnnotationShapes({ annotations, px, balls, showContacts, selectedId }: { annotations: Annotation[]; px: (n: number) => number; balls: Ball[]; showContacts: boolean; selectedId?: string | null }) {
  return (
    <g>
      {annotations.map((a) => {
        if (a.type === 'arrow') return <ArrowShape key={a.id} a={a} px={px} balls={balls} showContacts={showContacts} selected={selectedId === a.id} />;
        if (a.type === 'target') {
          const r = px(10);
          return (
            <g key={a.id}>
              {selectedId === a.id && <circle cx={a.x} cy={a.y} r={r + px(5)} fill="none" stroke={PALETTE.select} strokeWidth={px(3)} />}
              <circle cx={a.x} cy={a.y} r={r} fill="none" stroke={a.color} strokeWidth={px(2.5)} />
              <circle cx={a.x} cy={a.y} r={r * 0.45} fill="none" stroke={a.color} strokeWidth={px(2)} />
              <line x1={a.x - r * 1.4} y1={a.y} x2={a.x + r * 1.4} y2={a.y} stroke={a.color} strokeWidth={px(1.5)} />
              <line x1={a.x} y1={a.y - r * 1.4} x2={a.x} y2={a.y + r * 1.4} stroke={a.color} strokeWidth={px(1.5)} />
              <text x={a.x + r * 1.5} y={a.y - r} fontSize={px(11)} fill={PALETTE.label} stroke="#fff" strokeWidth={px(3)} paintOrder="stroke" fontWeight={700}>
                {`${'★'.repeat(a.priority)} ${a.name}`}
              </text>
            </g>
          );
        }
        return (
          <g key={a.id}>
            {selectedId === a.id && <circle cx={a.x} cy={a.y} r={px(6)} fill={PALETTE.select} />}
            <text x={a.x} y={a.y} fontSize={px(13)} fill={a.color} stroke="#fff" strokeWidth={px(3)} paintOrder="stroke" fontWeight={700}>
              {a.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export const CourtContent = memo(function CourtContent(p: CourtContentProps) {
  const px = (n: number) => n / p.pxPerM;
  const { board, court, score } = p;
  const jack = board.balls.find((b) => b.kind === 'jack');
  const onCourt = board.balls.filter((b) => b.status !== 'available');
  const scoring = new Set(score.scoringBallIds);
  const boundary = new Set(score.boundaryBallIds);
  const jackOn = jack && jack.status === 'inPlay';
  const jackStatus = jack ? jackAreaStatus(jack, jack.radius, court) : 'valid';
  const labelFs = px(11);
  // 描画順：無効球 → ジャック → カラー（選択中は最後）
  const order = [...onCourt].sort((a, b) => {
    const w = (x: Ball) => (x.status !== 'inPlay' ? 0 : x.kind === 'jack' ? 1 : 2) + (x.id === p.selectedId ? 10 : 0);
    return w(a) - w(b);
  });

  return (
    <g>
      <CourtLines court={court} px={px} showTargetBox={p.showTargetBox} showGrid={p.showGrid} showInvalidArea={p.showInvalidArea} showDimensions={p.showDimensions} />

      {p.showAnnotations !== false && <AnnotationShapes annotations={board.annotations} px={px} balls={board.balls} showContacts={p.showContacts} selectedId={p.selectedId} />}

      {/* ジャックからの測定線 */}
      {p.showDistances && jackOn &&
        score.ranking.map((r, i) => {
          const b = board.balls.find((x) => x.id === r.ballId)!;
          const col = r.side === 'red' ? PALETTE.red : PALETTE.blue;
          const mx = (b.x + jack!.x) / 2;
          const my = (b.y + jack!.y) / 2;
          return (
            <g key={`d-${r.ballId}`} opacity={r.scoring ? 0.95 : 0.55}>
              <line x1={jack!.x} y1={jack!.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={px(r.scoring ? 2 : 1.2)} strokeDasharray={r.scoring ? undefined : `${px(4)} ${px(3)}`} />
              {i < 8 && (
                <text x={mx} y={my - px(3)} fontSize={px(10)} textAnchor="middle" fill={col} stroke="#fff" strokeWidth={px(3)} paintOrder="stroke" fontWeight={700}>
                  {fmtCm(r.centerDistance)}
                </text>
              )}
            </g>
          );
        })}

      {order.map((b) => {
        const inactive = b.status !== 'inPlay';
        const outside = !isCircleInPlayingArea(b, b.radius, court);
        const sel = p.selectedId === b.id;
        const overlap = p.overlapIds?.has(b.id);
        const warnJack = b.kind === 'jack' && b.status === 'inPlay' && jackStatus !== 'valid';
        const haloR = Math.max(b.radius * 1.6, px(9));
        return (
          <g key={b.id} opacity={inactive ? 0.4 : 1} data-ball-id={b.id}>
            {p.showHalo && !inactive && haloR > b.radius * 1.5 && (
              <circle cx={b.x} cy={b.y} r={haloR} fill="none" stroke={ballFill(b) === PALETTE.jack ? '#ffffff' : ballFill(b)} strokeOpacity={0.55} strokeWidth={px(1.5)} />
            )}
            {sel && <circle cx={b.x} cy={b.y} r={b.radius + px(6)} fill="none" stroke={PALETTE.select} strokeWidth={px(3)} />}
            {b.id === p.pendingId && <circle cx={b.x} cy={b.y} r={b.radius + px(10)} fill="none" stroke="#a3e635" strokeWidth={px(2)} strokeDasharray={`${px(4)} ${px(3)}`} />}
            {(outside || warnJack) && !inactive && (
              <circle cx={b.x} cy={b.y} r={b.radius + px(4)} fill="none" stroke={PALETTE.danger} strokeWidth={px(2.5)} />
            )}
            {overlap && !inactive && <circle cx={b.x} cy={b.y} r={b.radius + px(2.5)} fill="none" stroke={PALETTE.warn} strokeWidth={px(2)} />}
            {boundary.has(b.id) && <circle cx={b.x} cy={b.y} r={b.radius + px(8)} fill="none" stroke={PALETTE.warn} strokeWidth={px(1.5)} strokeDasharray={`${px(2)} ${px(2)}`} />}
            <circle
              cx={b.x}
              cy={b.y}
              r={b.radius}
              fill={ballFill(b)}
              fillOpacity={p.ballOpacity}
              stroke={ballStroke(b)}
              strokeWidth={Math.min(px(1.2), b.radius * 0.2)}
              strokeDasharray={inactive ? `${b.radius * 0.3} ${b.radius * 0.2}` : undefined}
            />
            {scoring.has(b.id) && <circle cx={b.x} cy={b.y} r={b.radius * 0.28} fill="#fff" fillOpacity={0.9} />}
            {inactive && (
              <g stroke="#111" strokeWidth={Math.min(px(1.5), b.radius * 0.25)}>
                <line x1={b.x - b.radius * 0.6} y1={b.y - b.radius * 0.6} x2={b.x + b.radius * 0.6} y2={b.y + b.radius * 0.6} />
                <line x1={b.x + b.radius * 0.6} y1={b.y - b.radius * 0.6} x2={b.x - b.radius * 0.6} y2={b.y + b.radius * 0.6} />
              </g>
            )}
            {p.showNumbers && (
              <text
                x={b.x + Math.max(b.radius, px(9)) + px(2)}
                y={b.y - Math.max(b.radius, px(6))}
                fontSize={labelFs}
                fill={b.kind === 'jack' ? '#111827' : ballFill(b)}
                stroke="#fff"
                strokeWidth={px(3)}
                paintOrder="stroke"
                fontWeight={800}
              >
                {ballShortLabel(b) + (b.unofficial ? '*' : '')}
              </text>
            )}
          </g>
        );
      })}

      {/* 計測ツール */}
      {p.measure && p.measure.length > 0 && (
        <g>
          {p.measure.map((m, i) => (
            <circle key={i} cx={m.x} cy={m.y} r={px(4)} fill="#22c55e" stroke="#fff" strokeWidth={px(1.5)} />
          ))}
          {p.measure.length === 2 && (
            <>
              <line x1={p.measure[0].x} y1={p.measure[0].y} x2={p.measure[1].x} y2={p.measure[1].y} stroke="#16a34a" strokeWidth={px(2.5)} />
              <text
                x={(p.measure[0].x + p.measure[1].x) / 2 + px(6)}
                y={(p.measure[0].y + p.measure[1].y) / 2}
                fontSize={px(13)}
                fill="#14532d"
                stroke="#fff"
                strokeWidth={px(3)}
                paintOrder="stroke"
                fontWeight={800}
              >
                {fmtCm(distance(p.measure[0], p.measure[1]))}
              </text>
            </>
          )}
        </g>
      )}
      {p.arrowStart && <circle cx={p.arrowStart.x} cy={p.arrowStart.y} r={px(6)} fill="#f59e0b" stroke="#fff" strokeWidth={px(2)} />}
    </g>
  );
});
