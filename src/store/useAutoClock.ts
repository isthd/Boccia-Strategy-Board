// 試合再現の持ち時間を盤面から自動で進める。
// 次に投げるサイド（ジャック担当／ジャックに近くない側）の時計を動かし、盤面に投球が置かれたら止める。
import { useEffect, useRef } from 'react';
import { useDoc, useProfile } from './derived';
import { useUI } from './uiStore';
import { useClock } from './clockStore';
import * as M from '../domain/match';
import type { Side } from '../domain/types';

/** エンドごとの持ち時間（ファイナルショットは専用の時間） */
export function endTimes(m: M.MatchState, profile: ReturnType<typeof useProfile>): Record<Side, number> {
  const end = M.currentEndRecord(m);
  return end.kind === 'finalShot' && profile.tieBreak.kind === 'finalShot'
    ? { red: profile.tieBreak.timeSec, blue: profile.tieBreak.timeSec }
    : m.setup.timeSec;
}

export function useAutoClock() {
  const doc = useDoc();
  const profile = useProfile();
  const auto = useUI((s) => s.display.autoClock);
  const paused = useClock((s) => s.paused);
  const m = doc.mode === 'match' ? doc.match : null;
  const key = m ? `${doc.id}:${m.currentEnd}` : '';
  const target = m ? M.clockTarget(m, doc.court, profile) : null;
  const throwsLen = m?.throws.length ?? 0;
  const prevThrows = useRef(throwsLen);

  useEffect(() => {
    const recorded = prevThrows.current !== throwsLen;
    prevThrows.current = throwsLen;
    if (!m || !auto) return;
    const clock = useClock.getState();
    clock.ensure(key, endTimes(m, profile));
    if (paused) return;
    if (target == null) {
      if (clock.running) clock.stop();
      return;
    }
    if (clock.running === target) return;
    // 記録がないまま判定だけ変わった（当たった球を置き直した等）→ 経過時間ごと正しいサイドへ付け替える
    if (clock.running && !recorded) clock.retarget(target);
    else clock.start(target);
  }, [key, target, throwsLen, auto, paused]); // eslint-disable-line react-hooks/exhaustive-deps
}
