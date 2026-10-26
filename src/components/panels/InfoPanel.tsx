// 情報パネル：暫定スコア、距離順位、得点内訳、次投球サイド、残り球、警告
import { useMemo } from 'react';
import { useBoard, useDecision, useDoc, useOverlaps, useProfile, useScore } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { Btn, NumField, Note, Section, SideDot } from '../ui';
import { describeScore } from '../../domain/scoring';
import { fmtCm, fmtM } from '../../domain/numeric';
import { JACK_AREA_LABEL, jackAreaStatus } from '../../domain/geometry';
import { ballLabel } from '../../domain/document';
import { sandboxHint } from '../../domain/turn-engine';
import { sideLabel, type Side } from '../../domain/types';
import * as M from '../../domain/match';

export function ScoreCard() {
  const score = useScore();
  const doc = useDoc();
  const isMatch = doc.mode === 'match';
  return (
    <div className="rounded-xl bg-slate-900 p-3 text-white" data-testid="score-card">
      <div className="text-[11px] text-slate-300">このまま終了した場合の暫定得点{isMatch ? '（エンド確定前）' : ''}</div>
      <div className="mt-1 flex items-center justify-center gap-4 text-3xl font-black tabular-nums">
        <span className="flex items-center gap-2 text-red-400" data-testid="score-red">
          <SideDot side="red" className="h-4 w-4" />赤 {score.red}
        </span>
        <span className="text-slate-500">–</span>
        <span className="flex items-center gap-2 text-blue-400" data-testid="score-blue">
          青 {score.blue}
          <SideDot side="blue" className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 text-center text-xs text-slate-300">
        {score.leader ? `暫定リード：${sideLabel(score.leader)}` : score.relation === 'noJack' ? 'ジャック未配置' : '暫定同点'}
        {score.resolutionApplied !== 'auto' && <span className="ml-1 rounded bg-amber-500 px-1 text-black">手動補正中</span>}
      </div>
    </div>
  );
}

export function InfoPanel() {
  const doc = useDoc();
  const { board, preview } = useBoard();
  const score = useScore();
  const overlaps = useOverlaps();
  const profile = useProfile();
  const decision = useDecision();
  const select = useUI((s) => s.select);
  const selectedId = useUI((s) => s.selectedId);
  const jack = board.balls.find((b) => b.kind === 'jack');
  const jackStatus = jack && jack.status !== 'available' ? jackAreaStatus(jack, jack.radius, doc.court) : null;

  const unplaced = useMemo(() => {
    const r = { red: 0, blue: 0 };
    for (const b of board.balls) if (b.kind === 'color' && b.status === 'available' && b.side) r[b.side]++;
    return r;
  }, [board]);
  const unofficial = board.balls.some((b) => b.unofficial);

  const remaining: Record<Side, number> | null = doc.mode === 'match' && doc.match ? M.remainingThrows(doc.match) : null;

  const warnings: string[] = [];
  if (jackStatus && jackStatus !== 'valid') warnings.push(`ジャック：${JACK_AREA_LABEL[jackStatus]}（初回投球なら無効。試合中に弾かれた場合はクロスへ再配置の対象）`);
  for (const ex of score.excluded) {
    const b = board.balls.find((x) => x.id === ex.ballId);
    if (b && b.status === 'inPlay') warnings.push(`${ballLabel(b)}：${ex.reason}のため距離・得点から除外`);
  }
  if (overlaps.length) warnings.push(`2D表示上で重なっている球：${overlaps.map(([a, b]) => `${lbl(a)}と${lbl(b)}`).join('、')}（実際には重なりません。位置を調整するか重なり回避をオンに）`);
  if (score.nearTie) warnings.push('赤と青の最寄り球の差が1mm未満です。近接・要計測。必要なら下の手動補正で審判判断を反映してください。');
  if (score.boundaryBallIds.length) warnings.push(`得点境界付近（1mm未満）：${score.boundaryBallIds.map(lbl).join('、')}。要計測。`);
  if (unofficial) warnings.push('6球を超える球を含む「非公式の自由配置」です。');

  function lbl(id: string) {
    const b = board.balls.find((x) => x.id === id);
    return b ? ballLabel(b) : id;
  }

  return (
    <div>
      <ScoreCard />
      <div className="h-3" />
      <Section title="得点の根拠" testId="score-breakdown">
        <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{describeScore(score)}</p>
        {score.ranking.length === 0 ? (
          <p className="text-xs text-slate-500">有効なカラー球がありません。</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-[11px] text-slate-500">
                <th className="py-1">順</th>
                <th>球</th>
                <th className="text-right">中心間</th>
                <th className="text-right">表面間(推定)</th>
                <th className="text-center">得点</th>
              </tr>
            </thead>
            <tbody>
              {score.ranking.map((r, i) => {
                const b = board.balls.find((x) => x.id === r.ballId)!;
                return (
                  <tr
                    key={r.ballId}
                    className={`cursor-pointer border-t border-slate-100 dark:border-slate-700 ${selectedId === r.ballId ? 'bg-amber-100 dark:bg-amber-900/40' : ''}`}
                    onClick={() => select(r.ballId)}
                  >
                    <td className="py-1.5">{i + 1}</td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <SideDot side={r.side} />
                        {ballLabel(b)}
                        {score.boundaryBallIds.includes(r.ballId) && <span className="text-[10px] text-orange-600">要計測</span>}
                      </span>
                    </td>
                    <td className="text-right">{fmtCm(r.centerDistance)}</td>
                    <td className="text-right text-slate-500">{fmtCm(r.surfaceDistance)}</td>
                    <td className="text-center font-bold">{r.scoring ? '●' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Note>
          距離は球を半径{fmtCm(jack?.radius ?? 0.043)}の円（公称円周270mmから算出）と近似したモデル値です。実際の球は公差・変形があるため、最終判定は計測と審判判断が優先します。
        </Note>
      </Section>

      <Section title="同距離・近接の手動補正（審判判断）">
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['auto', '自動'],
              ['equal', '同距離'],
              ['red', '赤優勢'],
              ['blue', '青優勢'],
            ] as const
          ).map(([v, l]) => (
            <Btn key={v} small active={board.tieResolution === v} onClick={() => !preview && A.setTieResolution(v)} disabled={preview} testId={`tie-${v}`}>
              {l}
            </Btn>
          ))}
        </div>
        <Note>最寄りの赤球と青球の比較を、計測・審判判断の結果で上書きします。「自動」は座標計算どおり（1nm未満の差のみ同距離とみなします）。</Note>
      </Section>

      <Section title="次の投球">
        {doc.mode === 'match' && doc.match ? (
          decision ? (
            <div data-testid="next-side">
              <div className="flex items-center gap-2 text-lg font-bold">
                {decision.side ? (
                  <>
                    <SideDot side={decision.side} className="h-4 w-4" />
                    {sideLabel(decision.side)}が投球
                  </>
                ) : decision.endComplete ? (
                  'エンド終了'
                ) : (
                  <span className="text-amber-600">手動判断が必要</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{decision.reason}</p>
              <p className="text-[11px] text-slate-500">出典：{decision.ruleRef}</p>
              {decision.warnings.map((w) => (
                <Note key={w} kind="warn">
                  {w}
                </Note>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">試合パネルで進行中の段階を確認してください。</p>
          )
        ) : (
          <div>
            <p className="text-sm" data-testid="sandbox-hint">{sandboxHint(board.balls, doc.court, board.tieResolution)}</p>
            <Note>自由配置モードは投球順を強制しません。表示は配置から見た参考です（{profile.shortName}）。</Note>
          </div>
        )}
      </Section>

      <Section title="残り球">
        {remaining ? (
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1.5"><SideDot side="red" />赤 残り {remaining.red}球</span>
            <span className="flex items-center gap-1.5"><SideDot side="blue" />青 残り {remaining.blue}球</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5"><SideDot side="red" />赤 未配置 {unplaced.red}球</span>
              <span className="flex items-center gap-1.5"><SideDot side="blue" />青 未配置 {unplaced.blue}球</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['red', 'blue'] as const).map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <NumField label={`${sideLabel(s)}手持ち`} value={doc.handCounts[s] ?? unplaced[s]} min={0} max={99} width="w-16" onCommit={(v) => A.setHandCount(s, v)} />
                  {doc.handCounts[s] != null && (
                    <Btn small variant="ghost" onClick={() => A.setHandCount(s, null)}>自動</Btn>
                  )}
                </div>
              ))}
            </div>
            <Note>自由配置では未配置の球数を実際の残数とはみなしません。必要なら手持ち球数を手入力してください。</Note>
          </div>
        )}
      </Section>

      {warnings.length > 0 && (
        <Section title="注意">
          {warnings.map((w) => (
            <Note key={w} kind="warn">
              {w}
            </Note>
          ))}
        </Section>
      )}

      {jack && jack.status !== 'available' && (
        <p className="px-1 text-[11px] text-slate-500">
          ジャック座標 ({fmtM(jack.x)}, {fmtM(jack.y)}) ／ {jackStatus && JACK_AREA_LABEL[jackStatus]}
        </p>
      )}
    </div>
  );
}
