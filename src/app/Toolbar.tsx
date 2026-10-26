import { Fragment } from 'react';
import { useUI, TOOL_LABEL, type Tool } from '../store/uiStore';
import { useBoard } from '../store/derived';
import { distance } from '../domain/geometry';
import { fmtCm } from '../domain/numeric';

type ToolDef = { t: Tool; icon: React.ReactNode; key: string; short?: string };

// 目的ごとにまとめて並べる（球を置く／作図する／消す）
const GROUPS: Array<{ label: string; tools: ToolDef[] }> = [
  {
    label: '球',
    tools: [
      { t: 'select', icon: '☝', key: 'V', short: '選択' },
      { t: 'jack', icon: <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-600 bg-white" />, key: 'J', short: 'ジャック' },
      { t: 'red', icon: <span className="inline-block h-4 w-4 rounded-full bg-bred" />, key: 'R' },
      { t: 'blue', icon: <span className="inline-block h-4 w-4 rounded-full bg-bblue" />, key: 'B' },
    ],
  },
  {
    label: '作図',
    tools: [
      { t: 'arrow', icon: '➜', key: 'A' },
      { t: 'target', icon: '◎', key: 'T' },
      { t: 'measure', icon: '📏', key: 'M' },
      { t: 'text', icon: '✎', key: '' },
    ],
  },
  {
    label: '消す',
    tools: [{ t: 'delete', icon: '🗑', key: 'Del' }],
  },
];

export function Toolbar() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const measure = useUI((s) => s.measure);
  const arrowStart = useUI((s) => s.arrowStart);
  const { preview } = useBoard();

  let hint = '';
  if (tool === 'jack' || tool === 'red' || tool === 'blue') hint = 'コートをタップすると球を置きます。置いた球はドラッグで移動できます';
  else if (tool === 'select') hint = '球をタップで選択、ドラッグで移動。何もない所をドラッグで画面移動、2本指で拡大・縮小';
  else if (tool === 'delete') hint = '消したい球・作図をタップします（確認が出ます）';
  else if (tool === 'arrow') hint = arrowStart ? '② 終点（狙う位置）をタップします' : '① 始点をタップします（ボックス内をタップするとボックス中央から引きます）';
  else if (tool === 'target') hint = 'タップした位置に目標点を置きます';
  else if (tool === 'measure') hint = measure.length === 2 ? `距離 ${fmtCm(distance(measure[0], measure[1]))}（中心間）／もう一度タップで測り直し` : measure.length === 1 ? '② 2点目をタップします' : '① 1点目をタップします（球をタップすると球の中心に合わせます）';
  else if (tool === 'text') hint = 'タップした位置にメモ（注釈テキスト）を置きます';

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="no-scrollbar flex items-stretch gap-1 overflow-x-auto px-1.5 py-1" role="toolbar" aria-label="ツール">
        {GROUPS.map((g, gi) => (
          <Fragment key={g.label}>
            {gi > 0 && <div className="mx-1 w-px shrink-0 self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden />}
            <div className="flex shrink-0 gap-1" role="group" aria-label={g.label}>
              {g.tools.map(({ t, icon, key, short }) => {
                const active = tool === t;
                const danger = t === 'delete';
                return (
                  <button
                    key={t}
                    onClick={() => setTool(t)}
                    aria-pressed={active}
                    aria-label={TOOL_LABEL[t]}
                    title={key ? `${TOOL_LABEL[t]}（キー: ${key}）` : TOOL_LABEL[t]}
                    data-testid={`tool-${t}`}
                    className={`flex min-h-[48px] min-w-[48px] shrink-0 flex-col items-center justify-center rounded-lg px-2 text-[11px] font-bold leading-tight transition ${
                      active
                        ? danger
                          ? 'bg-rose-600 text-white shadow-inner ring-2 ring-rose-300'
                          : 'bg-amber-400 text-black shadow-inner ring-2 ring-amber-200'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    <span className="text-base leading-none">{icon}</span>
                    <span className="mt-1 whitespace-nowrap">{short ?? TOOL_LABEL[t]}</span>
                  </button>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
      <div
        className={`flex min-h-[28px] items-center gap-2 px-2 py-1 text-xs leading-snug ${
          preview ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200'
        }`}
        aria-live="polite"
        data-testid="tool-hint"
      >
        {preview ? (
          '再生中は閲覧のみです（「試合」タブで再生を終了）'
        ) : (
          <>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${tool === 'delete' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-black'}`}>{TOOL_LABEL[tool]}</span>
            <span className="min-w-0 truncate">{hint}</span>
          </>
        )}
      </div>
    </div>
  );
}
