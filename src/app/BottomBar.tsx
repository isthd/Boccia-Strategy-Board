import { useDocStore } from '../store/docStore';
import { useUI } from '../store/uiStore';
import { useDoc } from '../store/derived';
import * as A from '../store/actions';

export function BottomBar() {
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const doc = useDoc();
  const ui = useUI();
  const isMatch = doc.mode === 'match' && doc.match;
  const canRecord = isMatch && doc.match!.phase === 'color';

  const btn = 'flex min-h-[48px] min-w-[56px] flex-1 basis-0 flex-col items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-[11px] font-bold leading-tight transition disabled:opacity-35 sm:max-w-[120px]';
  const normal = `${btn} bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100`;

  return (
    <nav className="safe-bottom no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-t border-slate-200 bg-white px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800" aria-label="操作">
      <button className={normal} onClick={undo} disabled={!canUndo} data-testid="undo" aria-label="元に戻す">
        <span className="text-base">↶</span>戻す
      </button>
      <button className={normal} onClick={redo} disabled={!canRedo} data-testid="redo" aria-label="やり直す">
        <span className="text-base">↷</span>やり直す
      </button>
      {isMatch && (
        <button className={`${btn} bg-emerald-600 text-white`} onClick={() => ui.openDialog('recordThrow')} disabled={!canRecord} data-testid="bottom-record">
          <span className="text-base">⏵</span>1投を記録
        </button>
      )}
      <button className={normal} onClick={() => A.saveVariant(false)} data-testid="save-variant">
        <span className="text-base">💾</span>局面を保存
      </button>
      {!isMatch && (
        <button
          className={normal}
          onClick={() => {
            if (doc.variants.length < 2) {
              A.saveVariant(true);
              ui.toast('比較用にB案を作成しました。球を動かしてから比較してください。');
              return;
            }
            ui.setCompareIds([doc.activeVariantId, doc.variants.find((v) => v.id !== doc.activeVariantId)!.id]);
            ui.openDialog('compare');
          }}
          data-testid="bottom-compare"
        >
          <span className="text-base">⇆</span>A/B比較
        </button>
      )}
      <div className="ml-auto w-px shrink-0 self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden />
      <button
        className={`${btn} bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 dark:bg-slate-800 dark:text-rose-300 dark:ring-rose-800 dark:hover:bg-rose-900/30`}
        onClick={() => void A.resetBoard()}
        data-testid="reset"
        title={isMatch ? '記録前に置いた球を取り消します' : '盤面の球と作図をすべて消します（確認あり）'}
      >
        <span className="text-base">⟲</span>{isMatch ? '仮置き取消' : '初期化'}
      </button>
    </nav>
  );
}
