// 審判パドル。距離判定（どちらが近いか）とエンドの採点（どちらの点か）をコート上に示す。
// 実物と同じく、表が赤・裏が青の卓球ラケット型で、持ち手も面と同じ色。判定が変わると裏返して色を見せる。
// 距離判定は結果が変わるたびに数秒だけ表示し、エンド採点中は出したままにする。
import { useEffect, useId, useRef, useState } from 'react';
import type { ScoreResult } from '../../domain/scoring';
import { sideOfCloser } from '../../domain/scoring';
import type { Side } from '../../domain/types';
import { sideLabel } from '../../domain/types';

const SHOW_MS = 2800;
const SHADE: Record<Side, { light: string; base: string; dark: string }> = {
  red: { light: '#f0605a', base: '#d62828', dark: '#7f1010' },
  blue: { light: '#5b86f2', base: '#1d4ed8', dark: '#0e2a7a' },
};

interface Judgment {
  key: string;
  /** 見せる色。null は同距離・同点（赤青2本を見せる） */
  side: Side | null;
  title: string;
  sub?: string;
}

function judge(score: ScoreResult, scoring: boolean, nextSide: Side | null): Judgment | null {
  if (score.relation === 'noJack' || score.relation === 'none') return null;
  if (scoring) {
    const side = score.leader;
    return {
      key: `s:${score.red}-${score.blue}`,
      side,
      title: side ? `${sideLabel(side)} ${score[side]}点` : `同点 ${score.red}–${score.blue}`,
    };
  }
  const closer = sideOfCloser(score);
  return {
    key: `d:${score.relation}:${score.red}-${score.blue}:${nextSide ?? ''}`,
    side: closer,
    title: closer ? `${sideLabel(closer)}が近い` : '同距離',
    sub: nextSide ? `次は${sideLabel(nextSide)}` : undefined,
  };
}

/** パドル1面分の絵（面＋持ち手） */
function PaddleArt({ side }: { side: Side }) {
  const id = useId().replace(/:/g, '');
  const c = SHADE[side];
  return (
    <svg viewBox="0 0 100 170" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`f${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={c.light} />
          <stop offset="0.55" stopColor={c.base} />
          <stop offset="1" stopColor={c.dark} />
        </radialGradient>
        <linearGradient id={`w${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={c.dark} />
          <stop offset="0.35" stopColor={c.light} />
          <stop offset="0.6" stopColor={c.base} />
          <stop offset="1" stopColor={c.dark} />
        </linearGradient>
      </defs>
      {/* 持ち手（面と同じ色。下に向かって少し広がる） */}
      <path d="M30 84 Q38 96 39 108 L38 150 Q37.5 165 50 165 Q62.5 165 62 150 L61 108 Q62 96 70 84 Z" fill={`url(#w${id})`} stroke={c.dark} strokeWidth="1.2" />
      {/* 面：縁 → 面 → つや */}
      <ellipse cx="50" cy="50" rx="45" ry="47" fill={c.dark} />
      <ellipse cx="50" cy="50" rx="42.5" ry="44.5" fill={`url(#f${id})`} />
      <ellipse cx="36" cy="30" rx="17" ry="10" fill="#fff" opacity="0.22" transform="rotate(-32 36 30)" />
    </svg>
  );
}

/** 表赤・裏青のパドル。side が変わると Y 軸回転で裏返る */
function FlipPaddle({ side }: { side: Side }) {
  return (
    <div className="paddle-3d h-[120px] w-[71px]">
      <div className="paddle-flip relative h-full w-full" style={{ transform: side === 'blue' ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
        <div className="paddle-face absolute inset-0">
          <PaddleArt side="red" />
        </div>
        <div className="paddle-face absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
          <PaddleArt side="blue" />
        </div>
      </div>
    </div>
  );
}

export function RefereePaddle(props: { score: ScoreResult; scoring: boolean; nextSide: Side | null }) {
  const j = judge(props.score, props.scoring, props.nextSide);
  const key = j?.key ?? null;
  const [visibleKey, setVisibleKey] = useState<string | null>(null);
  const prevKey = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const first = prevKey.current === undefined;
    const changed = prevKey.current !== key;
    prevKey.current = key;
    if (!key) {
      setVisibleKey(null);
      return;
    }
    // 採点中は出しっぱなし。距離判定は結果が変わったときだけ数秒表示（初回表示時は出さない）
    if (props.scoring) {
      setVisibleKey(key);
      return;
    }
    if (first || !changed) return;
    setVisibleKey(key);
    const t = window.setTimeout(() => setVisibleKey((v) => (v === key ? null : v)), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [key, props.scoring]);

  if (!j || visibleKey !== j.key) return null;
  return (
    <div
      className="paddle-pop pointer-events-none absolute right-3 top-2 flex flex-col items-center"
      role="status"
      aria-live="polite"
      aria-label={[j.title, j.sub].filter(Boolean).join('、')}
      data-testid="referee-paddle"
      data-side={j.side ?? 'equal'}
    >
      <div className="paddle-shadow">
        {j.side ? (
          <FlipPaddle side={j.side} />
        ) : (
          // 同距離・同点：赤と青を2本、ハの字に掲げる
          <div className="flex h-[120px] items-end">
            <div className="h-[104px] w-[61px] origin-bottom -rotate-[14deg] translate-x-2">
              <PaddleArt side="red" />
            </div>
            <div className="h-[104px] w-[61px] origin-bottom rotate-[14deg] -translate-x-2">
              <PaddleArt side="blue" />
            </div>
          </div>
        )}
      </div>
      <div className="paddle-caption -mt-1 text-center text-white">
        <div className="whitespace-nowrap text-[15px] font-black tracking-wide">{j.title}</div>
        {j.sub && <div className="whitespace-nowrap text-[11px] font-bold opacity-90">{j.sub}</div>}
      </div>
    </div>
  );
}
