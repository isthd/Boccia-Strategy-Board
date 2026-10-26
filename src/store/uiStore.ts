// 画面状態（Undo対象外）。表示設定は端末ごとの利便設定として localStorage に保存。
import { create } from 'zustand';
import type { Side, Vec } from '../domain/types';

export type Tool = 'select' | 'jack' | 'red' | 'blue' | 'delete' | 'arrow' | 'target' | 'measure' | 'text';

export const TOOL_LABEL: Record<Tool, string> = {
  select: '選択・移動',
  jack: '白（ジャック）',
  red: '赤',
  blue: '青',
  delete: '削除',
  arrow: '矢印',
  target: '目標点',
  measure: '計測',
  text: '注釈',
};

export interface DisplaySettings {
  showNumbers: boolean;
  showGrid: boolean;
  ballOpacity: number;
  showDistances: boolean;
  /** 縮小表示時に球の位置を示す補助リング（実寸ではない） */
  showHalo: boolean;
  showTargetBox: boolean | null;
  /** 重なり回避（接触位置へスナップ） */
  snap: boolean;
  showContacts: boolean;
  showInvalidArea: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  showNumbers: true,
  showGrid: false,
  ballOpacity: 1,
  showDistances: true,
  showHalo: true,
  showTargetBox: null,
  snap: false,
  showContacts: true,
  showInvalidArea: true,
};

export interface ViewTransform {
  k: number;
  tx: number;
  ty: number;
}

export type PanelTab = 'info' | 'balls' | 'tactics' | 'variants' | 'match' | 'settings';

export type DialogName =
  | null
  | 'scenarios'
  | 'export'
  | 'matchSetup'
  | 'recordThrow'
  | 'recordJack'
  | 'help'
  | 'compare'
  | 'court';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'error';
}

interface ConfirmRequest {
  title: string;
  message: string;
  okLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface PromptRequest {
  title: string;
  label: string;
  initial: string;
  multiline: boolean;
  resolve: (v: string | null) => void;
}

export interface UIState {
  tool: Tool;
  selectedId: string | null;
  view: ViewTransform;
  display: DisplaySettings;
  measure: Vec[];
  arrowStart: { p: Vec; box: number | null } | null;
  tab: PanelTab;
  panelOpen: boolean;
  dialog: DialogName;
  recordSide: Side | null;
  toasts: Toast[];
  confirmReq: ConfirmRequest | null;
  promptReq: PromptRequest | null;
  dark: boolean;
  /** 投球履歴の再生プレビュー（seq） */
  previewSeq: number | null;
  compareIds: [string, string] | null;
  setTool: (t: Tool) => void;
  select: (id: string | null) => void;
  setView: (v: ViewTransform) => void;
  setDisplay: (p: Partial<DisplaySettings>) => void;
  setMeasure: (m: Vec[]) => void;
  setArrowStart: (a: UIState['arrowStart']) => void;
  setTab: (t: PanelTab) => void;
  setPanelOpen: (o: boolean) => void;
  openDialog: (d: DialogName, side?: Side | null) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  confirm: (o: { title: string; message: string; okLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (o: { title: string; label: string; initial?: string; multiline?: boolean }) => Promise<string | null>;
  closeConfirm: (ok: boolean) => void;
  closePrompt: (v: string | null) => void;
  setDark: (d: boolean) => void;
  setPreviewSeq: (s: number | null) => void;
  setCompareIds: (ids: [string, string] | null) => void;
}

function loadDisplay(): DisplaySettings {
  try {
    const raw = localStorage.getItem('bsb-display');
    if (raw) return { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<DisplaySettings>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_DISPLAY;
}

let toastSeq = 1;

export const useUI = create<UIState>((set, get) => ({
  tool: 'select',
  selectedId: null,
  view: { k: 1, tx: 0, ty: 0 },
  display: loadDisplay(),
  measure: [],
  arrowStart: null,
  tab: 'info',
  panelOpen: true,
  dialog: null,
  recordSide: null,
  toasts: [],
  confirmReq: null,
  promptReq: null,
  dark: typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  previewSeq: null,
  compareIds: null,
  setTool: (tool) => set({ tool, measure: [], arrowStart: null }),
  select: (selectedId) => set({ selectedId }),
  setView: (view) => set({ view }),
  setDisplay: (p) => {
    const display = { ...get().display, ...p };
    try {
      localStorage.setItem('bsb-display', JSON.stringify(display));
    } catch {
      /* ignore */
    }
    set({ display });
  },
  setMeasure: (measure) => set({ measure }),
  setArrowStart: (arrowStart) => set({ arrowStart }),
  setTab: (tab) => set({ tab, panelOpen: true }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  openDialog: (dialog, side = null) => set({ dialog, recordSide: side }),
  toast: (text, kind = 'info') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, text, kind }].slice(-4) });
    setTimeout(() => get().dismissToast(id), kind === 'info' ? 2500 : 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  confirm: ({ title, message, okLabel = 'OK', danger = false }) =>
    new Promise<boolean>((resolve) => set({ confirmReq: { title, message, okLabel, danger, resolve } })),
  prompt: ({ title, label, initial = '', multiline = false }) =>
    new Promise<string | null>((resolve) => set({ promptReq: { title, label, initial, multiline, resolve } })),
  closeConfirm: (ok) => {
    get().confirmReq?.resolve(ok);
    set({ confirmReq: null });
  },
  closePrompt: (v) => {
    get().promptReq?.resolve(v);
    set({ promptReq: null });
  },
  setDark: (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('bsb-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    set({ dark });
  },
  setPreviewSeq: (previewSeq) => set({ previewSeq }),
  setCompareIds: (compareIds) => set({ compareIds }),
}));
