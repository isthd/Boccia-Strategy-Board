import { useUI, TOOL_LABEL, type Tool } from '../store/uiStore';
import { useBoard } from '../store/derived';
import { distance } from '../domain/geometry';
import { fmtCm } from '../domain/numeric';

const TOOLS: Array<{ t: Tool; icon: React.ReactNode; key: string }> = [
  { t: 'select', icon: '☝', key: 'V' },
  { t: 'jack', icon: <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-600 bg-white" />, key: 'J' },
  { t: 'red', icon: <span className="inline-block h-4 w-4 rounded-full bg-bred" />, key: 'R' },
  { t: 'blue', icon: <span className="inline-block h-4 w-4 rounded-full bg-bblue" />, key: 'B' },
  { t: 'delete', icon: '🗑', key: 'Del' },
  { t: 'arrow', icon: '➜', key: 'A' },
  { t: 'target', icon: '◎', key: 'T' },
  { t: 'measure', icon: '📏', key: 'M' },
  { t: 'text', icon: '✎', key: '' },
];

export function Toolbar() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const measure = useUI((s) => s.measure);
  const arrowStart = useUI((s) => s.arrowStart);
  const { preview } = useBoard();

  let hint = '';
  if (tool === 'jack' || tool === 'red' || tool === 'blue') hint = 'コートをタップして球を置く／球をドラッグで移動';
  else if (tool === 'select') hint = '球をタップで選択・ドラッグで移動／余白ドラッグでパン／2本指でズーム';
  else if (tool === 'delete') hint = '削除する球・作図をタップ（確認あり）';
  else if (tool === 'arrow') hint = arrowStart ? '終点（狙う位置）をタップ' : '始点をタップ（ボックス内はボックス中心にスナップ）';
  else if (tool === 'target') hint = 'タップで目標点を置く';
  else if (tool === 'measure') hint = measure.length === 2 ? `距離 ${fmtCm(distance(measure[0], measure[1]))}（中心間）` : '2点をタップ（球をタップすると中心にスナップ）';
  else if (tool === 'text') hint = 'タップした位置に注釈テキストを置く';

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-1.5 py-1" role="toolbar" aria-label="ツール">
        {TOOLS.map(({ t, icon, key }) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            aria-pressed={tool === t}
            title={key ? `${TOOL_LABEL[t]}（${key}）` : TOOL_LABEL[t]}
            data-testid={`tool-${t}`}
            className={`flex min-h-[48px] min-w-[52px] shrink-0 flex-col items-center justify-center rounded-lg px-2 text-[11px] font-bold leading-tight transition ${
              tool === t ? 'bg-amber-400 text-black shadow-inner' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100'
            }`}
          >
            <span className="text-base leading-none">{icon}</span>
            <span className="mt-0.5 whitespace-nowrap">{TOOL_LABEL[t]}</span>
          </button>
        ))}
      </div>
      <div className="truncate px-2 pb-1 text-[11px] text-slate-600 dark:text-slate-300" aria-live="polite" data-testid="tool-hint">
        {preview ? '再生中は閲覧のみです（試合パネルで再生を終了）' : hint}
      </div>
    </div>
  );
}
