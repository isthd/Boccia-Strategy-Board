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

  const btn = 'flex min-h-[48px] min-w-[64px] shrink-0 flex-col items-center justify-center rounded-lg px-2 text-[11px] font-bold leading-tight disabled:opacity-35';
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
          <span className="text-base">⏵</span>1投記録
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
          <span className="text-base">⇆</span>比較
        </button>
      )}
      <button className={normal} onClick={() => ui.setView({ k: 1, tx: 0, ty: 0 })} data-testid="fit">
        <span className="text-base">⤢</span>全体表示
      </button>
      <button className={normal} onClick={() => void A.resetBoard()} data-testid="reset">
        <span className="text-base">⟲</span>{isMatch ? '仮置き取消' : '初期化'}
      </button>
    </nav>
  );
}
