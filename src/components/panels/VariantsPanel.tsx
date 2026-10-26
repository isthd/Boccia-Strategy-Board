// 局面パネル：A案/B案の保存・分岐・切替・比較
import { useDoc } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { Btn, Note, Section } from '../ui';
import { computeScore } from '../../domain/scoring';

export function VariantsPanel() {
  const doc = useDoc();
  const ui = useUI();
  if (doc.mode === 'match') {
    return (
      <Section title="局面の分岐">
        <p className="mb-2 text-sm">試合再現中の盤面は、自由配置の新しい盤面として分岐できます。元の試合は消えません。</p>
        <Btn onClick={() => A.branchMatchToSandbox(null)}>現在の局面から分岐</Btn>
        <Note>投球履歴の任意の時点からの分岐は、試合パネルの履歴から行えます。</Note>
      </Section>
    );
  }
  const openCompare = () => {
    const ids = doc.variants.map((v) => v.id);
    const cur = doc.activeVariantId;
    const other = ids.find((x) => x !== cur);
    if (!other) {
      ui.toast('比較するには局面を2つ以上作成してください（「分岐」）。', 'warn');
      return;
    }
    ui.setCompareIds([cur, other]);
    ui.openDialog('compare');
  };
  return (
    <div>
      <Section title="局面（戦術案）">
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <Btn small onClick={() => A.saveVariant(true)} testId="branch">分岐して編集</Btn>
          <Btn small onClick={() => A.saveVariant(false)}>局面を保存</Btn>
          <Btn small onClick={openCompare} testId="compare-open">A/B比較</Btn>
        </div>
        <div className="flex flex-col gap-1.5">
          {doc.variants.map((v) => {
            const s = computeScore(v.board.balls, doc.court, v.board.tieResolution);
            const parent = doc.variants.find((p) => p.id === v.parentId);
            const active = v.id === doc.activeVariantId;
            return (
              <div
                key={v.id}
                className={`flex items-center gap-2 rounded-lg border p-2 ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <button className="min-h-[40px] flex-1 text-left" onClick={() => A.switchVariant(v.id)} data-testid={`variant-${v.name}`}>
                  <div className="font-semibold">
                    {v.name} {active && <span className="text-xs text-emerald-700 dark:text-emerald-300">（編集中）</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    暫定 赤{s.red}–青{s.blue}
                    {parent ? ` ／ 分岐元：${parent.name}` : ''}
                  </div>
                </button>
                <Btn
                  small
                  variant="ghost"
                  onClick={async () => {
                    const n = await ui.prompt({ title: '局面名の変更', label: '名前', initial: v.name });
                    if (n) A.renameVariant(v.id, n);
                  }}
                >
                  名前
                </Btn>
                <Btn small variant="ghost" onClick={() => void A.deleteVariant(v.id)} disabled={doc.variants.length <= 1}>
                  削除
                </Btn>
              </div>
            );
          })}
        </div>
        <Note>「分岐して編集」は現在の盤面を複製して新しい案に切り替えます。元の案は変更されません。</Note>
      </Section>
    </div>
  );
}
