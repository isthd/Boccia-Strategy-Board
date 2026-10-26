// 文書（シナリオ）ストア：Undo/Redo はスナップショット方式。
// ドラッグ中は beginGesture → updateGesture → endGesture で1操作として履歴に積む。
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { BoardDoc } from '../domain/document';
import { nowIso } from '../domain/document';

const HISTORY_LIMIT = 200;

export interface DocState {
  doc: BoardDoc | null;
  past: BoardDoc[];
  future: BoardDoc[];
  lastLabel: string;
  gestureBase: BoardDoc | null;
  /** 文書を読み込む（履歴はリセット） */
  load: (doc: BoardDoc) => void;
  /** 履歴に積む変更 */
  apply: (label: string, fn: (d: Draft<BoardDoc>) => void) => void;
  /** 文書全体を置き換える変更（試合ロジックなど純粋関数の結果） */
  replace: (label: string, next: BoardDoc) => void;
  beginGesture: () => void;
  updateGesture: (fn: (d: Draft<BoardDoc>) => void) => void;
  endGesture: (label: string) => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
}

const touch = (d: BoardDoc): BoardDoc => ({ ...d, updatedAt: nowIso() });

export const useDocStore = create<DocState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  lastLabel: '',
  gestureBase: null,
  load: (doc) => set({ doc, past: [], future: [], gestureBase: null, lastLabel: '' }),
  apply: (label, fn) => {
    const { doc, past } = get();
    if (!doc) return;
    const next = produce(doc, fn);
    if (next === doc) return;
    set({ doc: touch(next), past: [...past, doc].slice(-HISTORY_LIMIT), future: [], lastLabel: label });
  },
  replace: (label, next) => {
    const { doc, past } = get();
    if (!doc) return;
    set({ doc: touch(next), past: [...past, doc].slice(-HISTORY_LIMIT), future: [], lastLabel: label });
  },
  beginGesture: () => {
    const { doc } = get();
    if (doc) set({ gestureBase: doc });
  },
  updateGesture: (fn) => {
    const { doc } = get();
    if (!doc) return;
    set({ doc: produce(doc, fn) });
  },
  endGesture: (label) => {
    const { doc, gestureBase, past } = get();
    if (!doc || !gestureBase) return;
    if (doc === gestureBase) {
      set({ gestureBase: null });
      return;
    }
    set({ doc: touch(doc), past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [], gestureBase: null, lastLabel: label });
  },
  cancelGesture: () => {
    const { gestureBase } = get();
    if (gestureBase) set({ doc: gestureBase, gestureBase: null });
  },
  undo: () => {
    const { doc, past, future } = get();
    if (!doc || past.length === 0) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastLabel: '元に戻す' });
  },
  redo: () => {
    const { doc, past, future } = get();
    if (!doc || future.length === 0) return;
    const [next, ...rest] = future;
    set({ doc: next, past: [...past, doc], future: rest, lastLabel: 'やり直す' });
  },
}));
