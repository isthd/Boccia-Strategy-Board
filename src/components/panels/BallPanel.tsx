// 球パネル：選択球の座標の数値編集、1cm/5cm移動、状態・半径、球の一覧（タッチしにくい球の選択用）
import { useBoard, useDoc } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { Btn, NumField, Note, Section, Select, SideDot } from '../ui';
import { ballLabel } from '../../domain/document';
import { BALL_STATUS_LABEL, type BallStatus } from '../../domain/types';
import { BALL_RADIUS, JACK_AREA_LABEL, isCircleInPlayingArea, jackAreaStatus } from '../../domain/geometry';
import { roundTo } from '../../domain/numeric';

export function BallPanel() {
  const doc = useDoc();
  const { board, preview } = useBoard();
  const selectedId = useUI((s) => s.selectedId);
  const select = useUI((s) => s.select);
  const b = board.balls.find((x) => x.id === selectedId);
  const isMatch = doc.mode === 'match';

  return (
    <div>
      <Section title={b ? `選択中：${ballLabel(b)}${b.unofficial ? '（非公式）' : ''}` : '選択中の球'} testId="ball-editor">
        {!b ? (
          <p className="text-sm text-slate-500">コート上の球をタップするか、下の一覧から選んでください。</p>
        ) : (
          <div className="space-y-2">
            {b.status === 'available' ? (
              <p className="text-sm text-slate-500">この球は未配置（手持ち）です。{!isMatch && '「コートに置く」でクロス付近に配置できます。'}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <NumField label="x" unit="cm" step={0.1} value={roundTo(b.x * 100, 0.1)} onCommit={(v) => A.setBallPos(b.id, { x: v / 100, y: b.y })} testId="ball-x" />
                  <NumField label="y" unit="cm" step={0.1} value={roundTo(b.y * 100, 0.1)} onCommit={(v) => A.setBallPos(b.id, { x: b.x, y: v / 100 })} testId="ball-y" />
                </div>
                <p className="text-[11px] text-slate-500">原点はコート上端左隅（投球エリアの反対側）、右が+x、下（投球エリア側）が+y。</p>
                <div className="grid grid-cols-2 gap-2">
                  {[0.01, 0.05].map((step) => (
                    <div key={step} className="grid grid-cols-3 gap-1">
                      <span />
                      <Btn small disabled={preview} onClick={() => A.nudgeBall(b.id, 0, -step)} ariaLabel={`上へ${step * 100}cm`}>↑{step * 100}</Btn>
                      <span />
                      <Btn small disabled={preview} onClick={() => A.nudgeBall(b.id, -step, 0)} ariaLabel={`左へ${step * 100}cm`}>←</Btn>
                      <span className="flex items-center justify-center text-xs text-slate-500">{step * 100}cm</span>
                      <Btn small disabled={preview} onClick={() => A.nudgeBall(b.id, step, 0)} ariaLabel={`右へ${step * 100}cm`}>→</Btn>
                      <span />
                      <Btn small disabled={preview} onClick={() => A.nudgeBall(b.id, 0, step)} ariaLabel={`下へ${step * 100}cm`}>↓{step * 100}</Btn>
                      <span />
                    </div>
                  ))}
                </div>
                <p className="text-xs">
                  {b.kind === 'jack'
                    ? JACK_AREA_LABEL[jackAreaStatus(b, b.radius, doc.court)]
                    : isCircleInPlayingArea(b, b.radius, doc.court)
                      ? 'プレイングエリア内'
                      : '⚠ プレイングエリア外／外周ラインに接触（アウト相当）'}
                </p>
              </>
            )}
            {b.kind === 'color' && (
              <Select<BallStatus>
                label="状態"
                value={b.status}
                options={(Object.keys(BALL_STATUS_LABEL) as BallStatus[]).map((s) => ({ value: s, label: BALL_STATUS_LABEL[s] }))}
                onChange={(s) => !preview && A.setBallStatus(b.id, s)}
                testId="ball-status"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <NumField label="半径" unit="cm" step={0.01} value={roundTo(b.radius * 100, 0.01)} min={1} max={20} width="w-20" onCommit={(v) => A.setBallRadius(b.id, v / 100)} />
              {Math.abs(b.radius - BALL_RADIUS) > 1e-9 && (
                <Btn small variant="ghost" onClick={() => A.setBallRadius(b.id, BALL_RADIUS)}>標準に戻す</Btn>
              )}
            </div>
            <Note>半径は描画・簡易測定用の近似値（標準：公称円周270mm→約4.30cm）。個別に変えた場合、距離順位は「表面間の推定距離」で判定します。</Note>
            <div className="flex flex-wrap gap-2">
              {b.status === 'available' && !isMatch && (
                <Btn small onClick={() => A.setBallPos(b.id, { x: doc.court.cross.x + (b.side === 'red' ? -0.3 : b.side === 'blue' ? 0.3 : 0), y: doc.court.cross.y + 0.5 })}>コートに置く</Btn>
              )}
              {b.status !== 'available' && (
                <Btn small variant="danger" disabled={preview} onClick={() => void A.removeBall(b.id)}>
                  {isMatch ? (doc.match?.pendingBallId === b.id ? '仮置きを取消' : 'アウト扱い') : '削除'}
                </Btn>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="球の一覧">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" role="list" aria-label="球の一覧">
          {board.balls.map((x) => (
            <button
              key={x.id}
              role="listitem"
              onClick={() => select(x.id)}
              className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2 text-left text-sm ${
                selectedId === x.id ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/40' : 'border-slate-200 dark:border-slate-700'
              } ${x.status === 'available' ? 'opacity-50' : ''}`}
              aria-label={`${ballLabel(x)} ${BALL_STATUS_LABEL[x.status]}`}
              data-testid={`ball-item-${x.id}`}
            >
              <SideDot side={x.kind === 'jack' ? 'jack' : x.side!} />
              <span className="font-semibold">{ballLabel(x)}</span>
              {x.status !== 'inPlay' && x.status !== 'available' && <span className="text-[10px] text-rose-600">{x.status}</span>}
            </button>
          ))}
        </div>
        <Note>薄い表示は未配置（手持ち）の球です。</Note>
      </Section>
    </div>
  );
}
