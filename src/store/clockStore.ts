// 各サイド独立の持ち時間タイマー（手動操作の補助。審判用の公式時計ではない）。
// Undo対象外。リロード後も続きから使えるよう localStorage に保存。
import { create } from 'zustand';
import type { Side } from '../domain/types';

interface ClockSnapshot {
  key: string;
  remaining: Record<Side, number>;
  running: Side | null;
  startedAt: number | null;
}

export interface ClockState extends ClockSnapshot {
  /** key（文書ID＋エンド番号）が変わったら持ち時間をリセット */
  ensure: (key: string, times: Record<Side, number>) => void;
  start: (side: Side) => void;
  /** 停止し、今回の経過秒を返す */
  stop: () => number | null;
  reset: (times: Record<Side, number>) => void;
  adjust: (side: Side, deltaSec: number) => void;
  remainingNow: (side: Side, now?: number) => number;
  elapsedNow: (now?: number) => number | null;
}

const LS = 'bsb-clock';

function save(s: ClockSnapshot) {
  try {
    localStorage.setItem(LS, JSON.stringify({ key: s.key, remaining: s.remaining, running: s.running, startedAt: s.startedAt }));
  } catch {
    /* ignore */
  }
}

function load(): ClockSnapshot {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return JSON.parse(raw) as ClockSnapshot;
  } catch {
    /* ignore */
  }
  return { key: '', remaining: { red: 0, blue: 0 }, running: null, startedAt: null };
}

export const useClock = create<ClockState>((set, get) => ({
  ...load(),
  ensure: (key, times) => {
    if (get().key === key) return;
    const s = { key, remaining: { ...times }, running: null, startedAt: null };
    set(s);
    save(s);
  },
  start: (side) => {
    const st = get();
    if (st.running === side) return;
    if (st.running) st.stop();
    const s = { ...get(), running: side, startedAt: Date.now() };
    set({ running: side, startedAt: s.startedAt });
    save(s);
  },
  stop: () => {
    const st = get();
    if (!st.running || st.startedAt == null) return null;
    const el = (Date.now() - st.startedAt) / 1000;
    const remaining = { ...st.remaining, [st.running]: Math.max(0, st.remaining[st.running] - el) };
    const s = { key: st.key, remaining, running: null, startedAt: null };
    set(s);
    save(s);
    return el;
  },
  reset: (times) => {
    const s = { key: get().key, remaining: { ...times }, running: null, startedAt: null };
    set(s);
    save(s);
  },
  adjust: (side, delta) => {
    const st = get();
    const remaining = { ...st.remaining, [side]: Math.max(0, st.remaining[side] + delta) };
    set({ remaining });
    save({ ...st, remaining });
  },
  remainingNow: (side, now = Date.now()) => {
    const st = get();
    const base = st.remaining[side];
    if (st.running === side && st.startedAt != null) return Math.max(0, base - (now - st.startedAt) / 1000);
    return base;
  },
  elapsedNow: (now = Date.now()) => {
    const st = get();
    return st.running && st.startedAt != null ? (now - st.startedAt) / 1000 : null;
  },
}));

export const fmtClock = (sec: number): string => {
  const s = Math.ceil(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
