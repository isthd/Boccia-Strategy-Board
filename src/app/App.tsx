import { useEffect } from 'react';
import { Header } from './Header';
import { Toolbar } from './Toolbar';
import { BottomBar } from './BottomBar';
import { CourtView } from '../components/court/CourtView';
import { InfoPanel } from '../components/panels/InfoPanel';
import { BallPanel } from '../components/panels/BallPanel';
import { TacticsPanel } from '../components/panels/TacticsPanel';
import { VariantsPanel } from '../components/panels/VariantsPanel';
import { MatchPanel } from '../components/panels/MatchPanel';
import { SettingsPanel } from '../components/panels/SettingsPanel';
import { ConfirmHost, PromptHost, Toasts } from '../components/dialogs/Modal';
import { MatchSetupDialog } from '../components/dialogs/MatchSetupDialog';
import { RecordThrowDialog } from '../components/dialogs/RecordThrowDialog';
import { ExportDialog } from '../components/dialogs/ExportDialog';
import { ScenarioListDialog } from '../components/dialogs/ScenarioListDialog';
import { CompareDialog } from '../components/dialogs/CompareDialog';
import { HelpDialog } from '../components/dialogs/HelpDialog';
import { useUI, type PanelTab, type Tool } from '../store/uiStore';
import { useDocStore } from '../store/docStore';
import { useDoc, useProfile } from '../store/derived';
import * as A from '../store/actions';
import { activeBoard } from '../domain/document';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'info', label: '盤面' },
  { id: 'balls', label: '球' },
  { id: 'tactics', label: '作戦' },
  { id: 'variants', label: '局面' },
  { id: 'match', label: '試合' },
  { id: 'settings', label: '設定' },
];

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const ui = useUI.getState();
      if (ui.dialog || ui.confirmReq || ui.promptReq) return;
      const ds = useDocStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ds.redo();
        else ds.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        ds.redo();
        return;
      }
      if (mod) return;
      const sel = ui.selectedId;
      if (sel && ds.doc && activeBoard(ds.doc).balls.some((b) => b.id === sel)) {
        const step = e.shiftKey ? 0.05 : 0.01;
        const map: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
        if (map[e.key]) {
          e.preventDefault();
          A.nudgeBall(sel, ...map[e.key]);
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          void A.removeBall(sel);
          return;
        }
      } else if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        void A.removeAnnotation(sel);
        return;
      }
      if (e.key === 'Escape') {
        ui.select(null);
        ui.setMeasure([]);
        ui.setArrowStart(null);
        return;
      }
      const tools: Record<string, Tool> = { v: 'select', j: 'jack', r: 'red', b: 'blue', m: 'measure', a: 'arrow', t: 'target' };
      const tool = tools[e.key.toLowerCase()];
      if (tool) ui.setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useKeyboard();
  const ui = useUI();
  const doc = useDoc();
  const profile = useProfile();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      {doc.court.custom && (
        <div className="shrink-0 bg-amber-400 px-2 py-0.5 text-center text-xs font-bold text-black">
          コート寸法：大会申し合わせによる変更{doc.court.customNote ? `（${doc.court.customNote}）` : ''}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Toolbar />
          <div className="min-h-0 flex-1">
            <CourtView />
          </div>
        </main>
        <aside
          className={`flex min-h-0 shrink-0 flex-col border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 portrait:border-t landscape:w-[340px] landscape:border-l xl:landscape:w-[400px] ${
            ui.panelOpen ? 'portrait:h-[38dvh]' : ''
          }`}
          aria-label="情報パネル"
        >
          <div className="flex shrink-0 items-stretch border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800" role="tablist">
            <button
              className="flex min-h-[44px] w-10 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-100 landscape:hidden dark:hover:bg-slate-700"
              onClick={() => ui.setPanelOpen(!ui.panelOpen)}
              aria-label={ui.panelOpen ? 'パネルを閉じてコートを広く表示' : 'パネルを開く'}
              title={ui.panelOpen ? 'パネルを閉じる' : 'パネルを開く'}
              aria-expanded={ui.panelOpen}
            >
              <span className="text-lg leading-none">{ui.panelOpen ? '▾' : '▴'}</span>
            </button>
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={ui.tab === t.id}
                onClick={() => ui.setTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`relative min-h-[44px] min-w-0 flex-1 border-b-[3px] px-1 text-sm font-bold transition ${
                  ui.tab === t.id && ui.panelOpen
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
                    : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {t.label}
                {t.id === 'match' && doc.mode === 'match' && <span className="absolute right-1 top-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" aria-label="試合中" />}
              </button>
            ))}
          </div>
          {ui.panelOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" role="tabpanel">
              {ui.tab === 'info' && <InfoPanel />}
              {ui.tab === 'balls' && <BallPanel />}
              {ui.tab === 'tactics' && <TacticsPanel />}
              {ui.tab === 'variants' && <VariantsPanel />}
              {ui.tab === 'match' && <MatchPanel />}
              {ui.tab === 'settings' && <SettingsPanel />}
              <p className="mt-4 px-1 text-[10px] leading-relaxed text-slate-500">
                規則：{profile.sourceDoc}に基づくトレーニングツール。公式審判判定の代替ではありません。大会申し合わせ・審判判断が優先されます。
              </p>
            </div>
          )}
        </aside>
      </div>
      <BottomBar />

      {ui.dialog === 'matchSetup' && <MatchSetupDialog />}
      {ui.dialog === 'recordThrow' && doc.match && <RecordThrowDialog />}
      {ui.dialog === 'export' && <ExportDialog />}
      {ui.dialog === 'scenarios' && <ScenarioListDialog />}
      {ui.dialog === 'compare' && doc.variants.length > 1 && <CompareDialog />}
      {ui.dialog === 'help' && <HelpDialog />}
      <ConfirmHost />
      <PromptHost />
      <Toasts />
    </div>
  );
}
