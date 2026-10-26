// 「この状態を1投として記録」ダイアログ
import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Btn, NumField, Note, Select, SideDot, TextField } from '../ui';
import { useDoc, useProfile } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import { useClock } from '../../store/clockStore';
import * as A from '../../store/actions';
import * as M from '../../domain/match';
import { SIDES, sideLabel, type Side } from '../../domain/types';
import { JACK_AREA_LABEL, jackAreaStatus } from '../../domain/geometry';
import { ballLabel } from '../../domain/document';

export function RecordThrowDialog() {
  const doc = useDoc();
  const m = doc.match!;
  const profile = useProfile();
  const ui = useUI();
  const close = () => ui.openDialog(null);
  const pending = m.pendingBallId ? m.board.balls.find((b) => b.id === m.pendingBallId) : null;
  const rem = M.remainingThrows(m);
  const defaultSide: Side = pending?.side ?? ui.recordSide ?? (rem.red > 0 ? 'red' : 'blue');
  const [side, setSide] = useState<Side>(defaultSide);
  const boxes = M.boxesOf(profile, m.setup.matchType, side);
  const end = M.currentEndRecord(m);
  const thrown = M.thrownThisEnd(m);
  const defaultBox =
    pending && pending.side === side
      ? pending.playerBox ?? boxes[0]
      : thrown.red + thrown.blue === 0 && end.jackBox && boxes.includes(end.jackBox)
        ? end.jackBox
        : boxes.find((b) => M.availableBalls(m, side, b).length > 0) ?? boxes[0];
  const [box, setBox] = useState<number>(defaultBox);
  const [result, setResult] = useState<'valid' | 'out' | 'retracted'>(pending ? 'valid' : 'out');
  const [note, setNote] = useState('');
  const elapsed = useClock.getState().elapsedNow();
  const [duration, setDuration] = useState<number>(elapsed != null ? Math.round(elapsed * 10) / 10 : 0);
  const outCands = useMemo(() => M.autoOutCandidates(m, doc.court, null), [m, doc.court]);
  const [outIds, setOutIds] = useState<string[]>(() => outCands.filter((b) => b.id !== m.pendingBallId).map((b) => b.id));
  const jack = m.board.balls.find((b) => b.kind === 'jack')!;
  const jStatus = jackAreaStatus(jack, jack.radius, doc.court);
  const [resetJack, setResetJack] = useState(jStatus === 'outOfPlayingArea' || jStatus === 'invalidArea');
  const pendingOutside = pending && outCands.some((b) => b.id === pending.id);

  const effectiveBox = boxes.includes(box) ? box : boxes[0];

  const submit = () => {
    if (rem[side] <= 0) {
      ui.toast(`${sideLabel(side)}に投球できる球が残っていません。`, 'error');
      return;
    }
    if (useClock.getState().running) useClock.getState().stop();
    let warnings: string[] = [];
    A.matchApply('1投を記録', (mm) => {
      const out = M.recordColorThrow(mm, doc.court, profile, {
        side,
        box: effectiveBox,
        result,
        note,
        durationSec: duration || null,
        markOutIds: outIds.filter((id) => id !== mm.pendingBallId || result !== 'valid'),
        resetJack,
      });
      warnings = out.warnings;
      return out.match;
    });
    for (const w of warnings) ui.toast(w, 'warn');
    close();
  };

  return (
    <Modal
      title="この状態を1投として記録"
      onClose={close}
      testId="record-dialog"
      footer={
        <>
          <Btn onClick={close}>キャンセル</Btn>
          <Btn variant="primary" onClick={submit} testId="record-submit">記録する</Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {SIDES.map((s) => (
            <Btn key={s} variant={side === s ? s : 'default'} onClick={() => setSide(s)} disabled={rem[s] <= 0} testId={`record-side-${s}`}>
              <SideDot side={s} />
              {sideLabel(s)}（残り{rem[s]}）
            </Btn>
          ))}
        </div>
        {boxes.length > 1 && (
          <Select<string>
            label="投球した選手"
            value={String(effectiveBox)}
            options={boxes.map((b) => ({ value: String(b), label: `${b}番 ${m.setup.players.find((p) => p.box === b)?.name ?? ''}（手持ち${M.availableBalls(m, side, b).length + (pending?.playerBox === b && pending.side === side ? 1 : 0)}）` }))}
            onChange={(v) => setBox(Number(v))}
          />
        )}
        <div>
          <div className="mb-1 text-sm">結果</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['valid', '有効（エリア内に停止）'],
                ['out', 'アウト'],
                ['retracted', '反則除去'],
              ] as const
            ).map(([v, l]) => (
              <Btn key={v} small active={result === v} onClick={() => setResult(v)} testId={`record-result-${v}`}>
                {l}
              </Btn>
            ))}
          </div>
          {pending ? (
            <p className="mt-1 text-xs">記録する球：{ballLabel(pending)}（盤面の仮置き位置）</p>
          ) : (
            <Note kind={result === 'valid' ? 'warn' : 'info'}>盤面に仮置きの球がありません。{result === 'valid' ? '有効とする場合は先にコートに球を置いてください（置かずに記録すると中央付近に置きます）。' : '手持ちの球を1球消費して記録します。'}</Note>
          )}
          {pendingOutside && result === 'valid' && <Note kind="warn">仮置き位置がプレイングエリア外です。アウトの可能性があります。</Note>}
        </div>

        {outCands.filter((b) => b.id !== m.pendingBallId).length > 0 && (
          <div>
            <div className="text-sm">エリア外にある球（弾き出された球）をアウトにする</div>
            {outCands
              .filter((b) => b.id !== m.pendingBallId)
              .map((b) => (
                <label key={b.id} className="flex min-h-[36px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={outIds.includes(b.id)} onChange={(e) => setOutIds(e.target.checked ? [...outIds, b.id] : outIds.filter((x) => x !== b.id))} />
                  {ballLabel(b)}
                </label>
              ))}
          </div>
        )}

        {jack.status === 'inPlay' && jStatus !== 'valid' && (
          <div>
            <label className="flex min-h-[40px] items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={resetJack} onChange={(e) => setResetJack(e.target.checked)} />
              ジャックをクロスへ再配置（{JACK_AREA_LABEL[jStatus]}）
            </label>
            {jStatus === 'touchingV' && <Note kind="warn">ジャックがVラインにかかっています。無効エリアに弾き出されたかどうかは審判判断です。</Note>}
            <Note>{profile.refs.jackOut}{profile.occupiedCrossRule === 'manual' ? '。クロスが塞がっている場合の置き位置はこの規則版に明示がないため、手動で確定してください。' : ''}</Note>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <NumField label="所要時間" unit="秒" step={0.1} value={duration} min={0} max={3600} width="w-20" onCommit={setDuration} />
        </div>
        <TextField label="メモ（任意）" value={note} onCommit={setNote} placeholder="例：青2を押し出し" />
        <Note>ボールをドラッグしただけでは投球数・持ち時間は減りません。この記録操作で1投として確定します。記録後もUndoで戻せます。</Note>
      </div>
    </Modal>
  );
}
