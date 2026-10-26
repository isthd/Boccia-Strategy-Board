// UI表示用の派生値（保存しない）
import { useMemo } from 'react';
import { useDocStore } from './docStore';
import { useUI } from './uiStore';
import { activeBoard } from '../domain/document';
import { computeScore } from '../domain/scoring';
import { getProfile } from '../domain/rules/registry';
import { findOverlaps } from '../domain/geometry';
import type { Board } from '../domain/types';
import * as M from '../domain/match';

export function useDoc() {
  return useDocStore((s) => s.doc)!;
}

/** 表示中の盤面（試合履歴の再生プレビュー中はそのスナップショット） */
export function useBoard(): { board: Board; preview: boolean } {
  const doc = useDoc();
  const previewSeq = useUI((s) => s.previewSeq);
  return useMemo(() => {
    const b = activeBoard(doc);
    if (doc.mode === 'match' && doc.match && previewSeq != null) {
      const ev = doc.match.throws.find((t) => t.seq === previewSeq);
      if (ev) return { board: { ...b, balls: ev.boardAfter }, preview: true };
    }
    return { board: b, preview: false };
  }, [doc, previewSeq]);
}

export function useProfile() {
  const id = useDocStore((s) => s.doc?.profileId ?? 'standard-2021-2024-v2');
  return getProfile(id);
}

export function useScore() {
  const doc = useDoc();
  const { board } = useBoard();
  return useMemo(() => computeScore(board.balls, doc.court, board.tieResolution), [board, doc.court]);
}

export function useOverlaps() {
  const { board } = useBoard();
  return useMemo(() => findOverlaps(board.balls), [board]);
}

export function useDecision() {
  const doc = useDoc();
  const profile = useProfile();
  return useMemo(() => {
    if (doc.mode !== 'match' || !doc.match) return null;
    if (doc.match.phase !== 'color') return null;
    return M.decideNext(doc.match, doc.court, profile);
  }, [doc, profile]);
}
