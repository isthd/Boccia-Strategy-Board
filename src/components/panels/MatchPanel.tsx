// 試合再現パネル：段階ごとの操作、持ち時間、エンド別スコア、投球履歴
import { useEffect, useState } from 'react';
import { useDecision, useDoc, useProfile, useScore } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import { fmtClock, useClock } from '../../store/clockStore';
import * as A from '../../store/actions';
import * as M from '../../domain/match';
import { Btn, NumField, Note, Section, Select, SideDot, TextField } from '../ui';
import { MATCH_TYPE_LABEL, SIDES, sideLabel, type Side } from '../../domain/types';
import { JACK_AREA_LABEL } from '../../domain/geometry';
import { ballLabel } from '../../domain/document';
import { sideOfBox } from '../../domain/rules/registry';

function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function endLabel(e: M.EndRecord): string {
  return e.kind === 'regular' ? `第${e.no}エンド` : e.kind === 'tiebreak' ? `タイブレイク${e.no}` : `ファイナルショット${e.no}`;
}

function Clocks() {
  useTick();
  const doc = useDoc();
  const m = doc.match!;
  const end = M.currentEndRecord(m);
  const profile = useProfile();
  const clock = useClock();
  const times =
    end.kind === 'finalShot' && profile.tieBreak.kind === 'finalShot'
      ? { red: profile.tieBreak.timeSec, blue: profile.tieBreak.timeSec }
      : m.setup.timeSec;
  const key = `${doc.id}:${m.currentEnd}`;
  useEffect(() => clock.ensure(key, times), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section title={`持ち時間（${endLabel(end)}）`} right={<Btn small variant="ghost" onClick={() => clock.reset(times)}>リセット</Btn>}>
      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((s) => {
          const rem = clock.remainingNow(s);
          const running = clock.running === s;
          return (
            <div key={s} className={`rounded-lg p-2 text-center ${s === 'red' ? 'bg-red-50 dark:bg-red-950/40' : 'bg-blue-50 dark:bg-blue-950/40'} ${running ? 'ring-2 ring-amber-400' : ''}`}>
              <div className="flex items-center justify-center gap-1 text-xs font-bold">
                <SideDot side={s} />
                {sideLabel(s)}
              </div>
              <div className={`text-3xl font-black tabular-nums ${rem <= 10 ? 'text-rose-600' : rem <= 60 ? 'text-amber-600' : ''}`} data-testid={`clock-${s}`}>
                {fmtClock(rem)}
              </div>
              <div className="mt-1 flex justify-center gap-1">
                {running ? (
                  <Btn small onClick={() => clock.stop()}>停止</Btn>
                ) : (
                  <Btn small variant={s} onClick={() => clock.start(s)}>投球指示</Btn>
                )}
              </div>
              <div className="mt-1 flex justify-center gap-1">
                <Btn small variant="ghost" onClick={() => clock.adjust(s, -10)}>−10秒</Btn>
                <Btn small variant="ghost" onClick={() => clock.adjust(s, 10)}>＋10秒</Btn>
              </div>
            </div>
          );
        })}
      </div>
      <Note>
        各サイド独立のタイマーです。「投球指示」で開始、球が停止したら「停止」または投球記録で止まります。ジャック投球も持ち時間に含みます（{profile.timeRef}）。現実の試合の審判用公式時計ではありません。
      </Note>
    </Section>
  );
}

function JackPhase() {
  const doc = useDoc();
  const m = doc.match!;
  const profile = useProfile();
  const ui = useUI();
  const t = M.currentJackThrower(m, profile);
  const check = M.jackCheck(m, doc.court);
  const end = M.currentEndRecord(m);
  const allBoxes = [...profile.matchTypes[m.setup.matchType].redBoxes, ...profile.matchTypes[m.setup.matchType].blueBoxes].sort();
  const [manualBox, setManualBox] = useState<string>(String(allBoxes[0]));
  const [note, setNote] = useState('');

  const record = (result: 'valid' | 'foul') => {
    if (result === 'valid' && !check.onCourt) {
      ui.toast('ジャックツールでコートにジャックを置いてから記録してください。', 'warn');
      return;
    }
    const el = useClock.getState().stop();
    A.matchApply(result === 'valid' ? 'ジャック有効を記録' : 'ジャックファウルを記録', (mm) =>
      M.recordJack(mm, doc.court, profile, { result, box: t.box, note, durationSec: el }),
    );
    setNote('');
    if (result === 'foul') ui.toast('ジャックファウルを記録しました。次の担当がジャックを投球します。');
    else ui.setTool('select');
  };

  const manualRow = (
    <div className="flex items-center gap-2">
      <Select<string>
        label={t.manualRequired ? '担当ボックス' : '担当を手動変更'}
        value={manualBox}
        options={allBoxes.map((b) => ({ value: String(b), label: `${b}番（${sideLabel(sideOfBox(profile, m.setup.matchType, b)!)}）` }))}
        onChange={setManualBox}
      />
      <Btn
        small
        onClick={async () => {
          const reason = await ui.prompt({ title: '手動判断の理由', label: '理由（記録に残ります）', initial: '審判・主催者判断' });
          if (reason != null) A.matchApply('ジャック担当を手動指定', (mm) => M.setManualJackBox(mm, Number(manualBox), reason));
        }}
      >
        確定
      </Btn>
    </div>
  );

  return (
    <Section title="ジャック投球" testId="jack-phase">
      {t.manualRequired ? (
        <div className="space-y-2">
          <Note kind="warn">{t.reason}</Note>
          {manualRow}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-lg font-bold">
            <SideDot side={t.side!} className="h-4 w-4" />
            {sideLabel(t.side!)} {t.box}番ボックス
            {m.setup.players.find((p) => p.box === t.box)?.name && <span className="text-sm font-normal">（{m.setup.players.find((p) => p.box === t.box)!.name}）</span>}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{t.reason}{end.jackFouls > 0 ? `（このエンドのファウル${end.jackFouls}回）` : ''}</p>
          <p className="text-[11px] text-slate-500">出典：{t.ruleRef}</p>
          {t.provisional && <Note kind="warn">ジャック投球ローテーションはこの規則版の本文に明示がないため「通常版からの初期提案／大会要確認」です。必要なら担当を手動で変更してください。</Note>}
          <ol className="my-2 list-decimal pl-5 text-sm">
            <li>ツールで「白（ジャック）」を選び、止まった位置をタップ（ドラッグで調整）</li>
            <li>結果を記録</li>
          </ol>
          <div className="mb-2 flex gap-2">
            <Btn small onClick={() => ui.setTool('jack')} active={ui.tool === 'jack'}>白（ジャック）を置く</Btn>
          </div>
          <p className="text-sm" data-testid="jack-check">
            位置判定：{check.onCourt ? JACK_AREA_LABEL[check.area] : '未配置'}
          </p>
          <TextField label="メモ（任意）" value={note} onCommit={setNote} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Btn variant="primary" onClick={() => record('valid')} testId="jack-valid">有効として記録</Btn>
            <Btn variant="danger" onClick={() => record('foul')} testId="jack-foul">ファウルとして記録</Btn>
          </div>
          {check.onCourt && check.area !== 'valid' && <Note kind="warn">位置判定では有効エリア外です。最終判断は審判が行うため、どちらでも記録できます。</Note>}
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">{manualRow}</div>
        </>
      )}
    </Section>
  );
}

function ColorPhase() {
  const doc = useDoc();
  const m = doc.match!;
  const profile = useProfile();
  const decision = useDecision();
  const ui = useUI();
  const rem = M.remainingThrows(m);
  const byBox = M.remainingByBox(m);
  const pending = m.pendingBallId ? m.board.balls.find((b) => b.id === m.pendingBallId) : null;
  const side = decision?.side ?? null;

  const manual = async (s: Side) => {
    const reason = await ui.prompt({ title: `次投球サイドを${sideLabel(s)}に指定`, label: '理由（記録に残ります）', initial: '審判判断' });
    if (reason != null) A.matchApply('次投球サイドを手動指定', (mm) => M.setManualNextSide(mm, s, reason));
  };

  return (
    <Section title="カラーボールの投球" testId="color-phase">
      {decision && (
        <div className="mb-2">
          {decision.side ? (
            <div className="flex items-center gap-2 text-lg font-bold" data-testid="match-next">
              <SideDot side={decision.side} className="h-4 w-4" />
              次は{sideLabel(decision.side)}
            </div>
          ) : (
            <div className="text-lg font-bold text-amber-600" data-testid="match-next">次投球サイド：手動判断が必要</div>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-300">{decision.reason}</p>
          <p className="text-[11px] text-slate-500">出典：{decision.ruleRef}</p>
          {decision.warnings.map((w) => (
            <Note key={w} kind="warn">{w}</Note>
          ))}
          {decision.manualRequired && <Note kind="warn">規則に根拠がないため自動確定しません。審判・主催者の判断で次のサイドを選んでください。</Note>}
          <div className="mt-2 flex gap-2">
            <Btn small variant="ghost" onClick={() => manual('red')}>赤に手動指定</Btn>
            <Btn small variant="ghost" onClick={() => manual('blue')}>青に手動指定</Btn>
          </div>
        </div>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
        {SIDES.map((s) => (
          <div key={s} className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
            <div className="flex items-center gap-1 font-semibold">
              <SideDot side={s} />
              {sideLabel(s)} 残り{rem[s]}球
            </div>
            {M.boxesOf(profile, m.setup.matchType, s).length > 1 && (
              <div className="text-[11px] text-slate-500">
                {M.boxesOf(profile, m.setup.matchType, s).map((b) => `${b}番:${byBox[b] ?? 0}`).join(' ／ ')}
              </div>
            )}
          </div>
        ))}
      </div>
      <ol className="mb-2 list-decimal pl-5 text-sm">
        <li>{side ? `ツール「${sideLabel(side)}」` : '球の色'}を選び、止まった位置をタップ（ドラッグで調整）</li>
        <li>当たって動いた球・ジャックもドラッグで置き直す</li>
        <li>「この状態を1投として記録」</li>
      </ol>
      <div className="mb-2 flex flex-wrap gap-2">
        {SIDES.map((s) => (
          <Btn key={s} small variant={s} onClick={() => ui.setTool(s)} active={ui.tool === s} disabled={rem[s] <= 0}>
            {sideLabel(s)}を置く
          </Btn>
        ))}
      </div>
      {pending && <p className="mb-2 text-sm">仮置き中：<b>{ballLabel(pending)}</b>（未記録）</p>}
      <Btn variant="primary" className="w-full" onClick={() => ui.openDialog('recordThrow', side)} testId="record-throw">
        この状態を1投として記録
      </Btn>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {SIDES.map((s) => (
          <Btn
            key={s}
            small
            disabled={rem[s] <= 0}
            onClick={async () => {
              const ok = await ui.confirm({ title: 'BNP（投球しない）申告', message: `${sideLabel(s)}は残り${rem[s]}球を投球しないと申告します（${profile.refs.bnp}）。`, okLabel: '申告する' });
              if (ok) A.matchApply('BNP申告', (mm) => M.declareBNP(mm, doc.court, profile, s, ''));
            }}
          >
            {sideLabel(s)} BNP申告
          </Btn>
        ))}
      </div>
      <Btn
        small
        className="mt-2 w-full"
        onClick={async () => {
          const ok = await ui.confirm({
            title: 'ジャックをクロスへ再配置',
            message: `試合中にジャックがプレイングエリア外またはジャック無効エリアに弾き出された場合、クロスへ置き直します（${profile.refs.jackOut}）。直前に投球したサイドを「弾き出したサイド」として記録します。`,
            okLabel: '再配置',
          });
          if (!ok) return;
          let warn: string | null = null;
          A.matchApply('ジャックを再配置', (mm) => {
            const r = M.manualJackReset(mm, doc.court, profile, mm.lastThrower);
            warn = r.warning;
            return r.match;
          });
          if (warn) ui.toast(warn, 'warn');
        }}
      >
        ジャックをクロスへ再配置
      </Btn>
    </Section>
  );
}

function ScoringPhase() {
  const doc = useDoc();
  const m = doc.match!;
  const end = M.currentEndRecord(m);
  const profile = useProfile();
  const score = useScore();
  const ui = useUI();
  const [useOverride, setUseOverride] = useState(false);
  const [ov, setOv] = useState({ red: score.red, blue: score.blue });
  const [reason, setReason] = useState('');
  const [manualWinner, setManualWinner] = useState<Side | ''>('');
  const isTie = end.kind !== 'regular';
  const penaltyPts = { red: 0, blue: 0 };
  for (const p of end.penalties) if (p.result === 'in') penaltyPts[p.side]++;

  const confirm = () => {
    const clock = useClock.getState();
    clock.stop();
    const remainingSec = { red: clock.remainingNow('red'), blue: clock.remainingNow('blue') };
    const out = M.confirmEnd(m, doc.court, profile, {
      override: useOverride ? { red: ov.red, blue: ov.blue, reason } : null,
      remainingSec,
      manualWinner: manualWinner ? { side: manualWinner, reason } : null,
    });
    if (out.error) {
      ui.toast(out.error, 'error');
      return;
    }
    A.matchApply(`${endLabel(end)}の得点を確定`, () => out.match);
    ui.setTool('select');
  };

  const equalShot = end.kind === 'finalShot' && score.red === score.blue && !useOverride;

  return (
    <Section title={`${endLabel(end)}の採点`} testId="scoring-phase">
      <p className="text-sm">
        計算上の得点：<b className="text-red-600">赤 {score.red}</b> – <b className="text-blue-600">青 {score.blue}</b>
        {profile.penaltyBalls && end.penalties.length > 0 && (
          <span className="ml-1 text-xs">（ペナルティ加点 赤+{penaltyPts.red}／青+{penaltyPts.blue}）</span>
        )}
      </p>
      {isTie && <Note>{profile.tieBreak.label}の得点は試合の合計得点に加算せず、勝敗の判定にのみ使います（{profile.tieBreak.ruleRef}）。</Note>}
      <label className="mt-2 flex min-h-[40px] items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} data-testid="override-toggle" />
        審判判定による手動得点修正
      </label>
      {useOverride && (
        <div className="space-y-2">
          <div className="flex gap-3">
            <NumField label="赤" value={ov.red} min={0} max={20} width="w-16" onCommit={(v) => setOv({ ...ov, red: v })} />
            <NumField label="青" value={ov.blue} min={0} max={20} width="w-16" onCommit={(v) => setOv({ ...ov, blue: v })} />
          </div>
          <TextField label="修正理由（記録に残ります）" value={reason} onCommit={setReason} placeholder="例：審判計測により青優勢" />
        </div>
      )}

      {profile.penaltyBalls && end.kind !== 'finalShot' ? (
        <div className="mt-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <div className="mb-1 text-sm font-semibold">ペナルティボール（{profile.refs.penalty}）</div>
          <p className="mb-1 text-xs text-slate-500">
            通常エンドの球を回収した後、付与されたサイドが35cmターゲットボックスへ1球につき1分以内に投球します。反則判定・成功判定は自動化しません。結果を確定してください（ターゲットボックス内に外枠ラインに触れず停止で+1点）。
          </p>
          {end.penalties.map((p) => (
            <div key={p.id} className="mb-1 flex flex-wrap items-center gap-1.5">
              <SideDot side={p.side} />
              <span className="text-sm">{sideLabel(p.side)}</span>
              {(['in', 'miss'] as const).map((r) => (
                <Btn key={r} small active={p.result === r} onClick={() => A.matchApply('ペナルティ結果', (mm) => M.setPenaltyResult(mm, p.id, r))}>
                  {r === 'in' ? '成功(+1)' : '失敗'}
                </Btn>
              ))}
              <Btn small variant="ghost" onClick={() => A.matchApply('ペナルティ削除', (mm) => M.removePenalty(mm, p.id))}>削除</Btn>
            </div>
          ))}
          <div className="flex gap-2">
            {SIDES.map((s) => (
              <Btn key={s} small onClick={() => A.matchApply('ペナルティ付与', (mm) => M.addPenalty(mm, s))}>
                {sideLabel(s)}にペナルティ付与
              </Btn>
            ))}
          </div>
        </div>
      ) : (
        !profile.penaltyBalls && <Note>フレンドリー版には通常版と同等のペナルティボール加点フローを適用しません。反則はボール除去として投球記録で扱います（フレンドリー版 §11）。</Note>
      )}

      {equalShot && (
        <div className="mt-2">
          <Note kind="warn">ファイナルショットで勝敗がつきません。フレンドリー版本文にはこの場合の規定がありません。主催者・審判判断で勝者を選ぶか、確定後にもう一度ファイナルショットを行えます。</Note>
          <Select<Side | ''>
            label="勝者（主催者判断）"
            value={manualWinner}
            options={[
              { value: '', label: '未選択（もう一度行う）' },
              { value: 'red', label: '赤' },
              { value: 'blue', label: '青' },
            ]}
            onChange={setManualWinner}
          />
        </div>
      )}
      <Btn variant="primary" className="mt-3 w-full" onClick={confirm} testId="confirm-end">
        エンド得点を確定
      </Btn>
    </Section>
  );
}

function TiebreakSetup() {
  const doc = useDoc();
  const m = doc.match!;
  const profile = useProfile();
  const [first, setFirst] = useState<Side>('red');
  const lastEnd = m.ends[m.ends.length - 1];
  const t = M.totals(m);
  return (
    <Section title={profile.tieBreak.label} testId="tiebreak-setup">
      <p className="mb-1 text-sm">
        合計 赤{t.red}–青{t.blue} の同点です。{lastEnd.kind === 'finalShot' ? 'ファイナルショットでも勝敗がつきませんでした。' : ''}
      </p>
      <Note>{profile.tieBreak.description}（{profile.tieBreak.ruleRef}）</Note>
      {lastEnd.kind === 'finalShot' && <Note kind="warn">フレンドリー版本文にはファイナルショットが同点の場合の規定がありません。主催者・審判の判断に従ってください。</Note>}
      <div className="mt-2">
        <Select<Side>
          label="コイントスの結果、先に投球するサイド"
          value={first}
          options={[
            { value: 'red', label: '赤' },
            { value: 'blue', label: '青' },
          ]}
          onChange={setFirst}
        />
      </div>
      <Btn variant="primary" className="mt-2 w-full" onClick={() => A.matchApply(`${profile.tieBreak.label}開始`, (mm) => M.startTiebreak(mm, doc.court, profile, first))} testId="start-tiebreak">
        {profile.tieBreak.label}を開始（先攻のジャックをクロスに配置）
      </Btn>
      {lastEnd.kind === 'finalShot' && (
        <div className="mt-2 flex gap-2">
          {SIDES.map((s) => (
            <Btn
              key={s}
              small
              onClick={async () => {
                const reason = await useUI.getState().prompt({ title: '主催者判断で勝者を確定', label: '理由', initial: '主催者判断' });
                if (reason != null) A.matchApply('勝者を手動確定', (mm) => M.decideWinnerManually(mm, s, reason));
              }}
            >
              {sideLabel(s)}の勝ちとして確定
            </Btn>
          ))}
        </div>
      )}
    </Section>
  );
}

function ScoreTable() {
  const doc = useDoc();
  const m = doc.match!;
  const t = M.totals(m);
  return (
    <Section title="スコア表" testId="score-table">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th>エンド</th>
            <th className="text-right text-red-600">赤</th>
            <th className="text-right text-blue-600">青</th>
            <th className="pl-2">備考</th>
          </tr>
        </thead>
        <tbody>
          {m.ends.map((e, i) => (
            <tr key={i} className={`border-t border-slate-100 dark:border-slate-700 ${i === m.currentEnd && m.phase !== 'finished' ? 'bg-amber-50 dark:bg-amber-900/30' : ''}`}>
              <td className="py-1">{endLabel(e)}</td>
              <td className="text-right">{e.final ? e.final.red : '–'}</td>
              <td className="text-right">{e.final ? e.final.blue : '–'}</td>
              <td className="pl-2 text-[11px] text-slate-500">
                {e.jackBox ? `J:${e.jackBox}番 ` : ''}
                {e.jackFouls ? `Jファウル${e.jackFouls} ` : ''}
                {e.override ? `手動修正（${e.override.reason}） ` : ''}
                {e.penalties.length ? `PB${e.penalties.filter((p) => p.result === 'in').length}/${e.penalties.length} ` : ''}
                {e.kind !== 'regular' ? '※合計に加算しない ' : ''}
                {e.manualWinner ? `勝者判断:${sideLabel(e.manualWinner)}` : ''}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-400 font-bold">
            <td className="py-1">合計（正規エンド）</td>
            <td className="text-right" data-testid="total-red">{t.red}</td>
            <td className="text-right" data-testid="total-blue">{t.blue}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {m.phase === 'finished' && m.winner && (
        <div className="mt-2 rounded-lg bg-emerald-600 p-2 text-center font-bold text-white" data-testid="winner">
          試合終了：{sideLabel(m.winner)}（{m.winner === 'red' ? m.setup.redName : m.setup.blueName}）の勝ち ／ {m.winnerReason}
        </div>
      )}
    </Section>
  );
}

function History() {
  const doc = useDoc();
  const m = doc.match!;
  const previewSeq = useUI((s) => s.previewSeq);
  const setPreview = useUI((s) => s.setPreviewSeq);
  const list = [...m.throws].reverse();
  return (
    <Section title={`投球履歴（${m.throws.length}）`} right={previewSeq != null ? <Btn small variant="primary" onClick={() => setPreview(null)}>再生を終了</Btn> : undefined}>
      {list.length === 0 && <p className="text-sm text-slate-500">まだ記録はありません。</p>}
      <div className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
        {list.map((ev) => {
          const ball = ev.ballId ? m.board.balls.find((b) => b.id === ev.ballId) : null;
          return (
            <div key={ev.id} className={`rounded border p-1.5 text-xs ${previewSeq === ev.seq ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-slate-500">#{ev.seq}</span>
                <span>{endLabel(m.ends[ev.endIdx])}</span>
                {ev.side && <SideDot side={ev.side} />}
                <b>{ball ? ballLabel(ball) : ev.kind === 'bnp' ? 'BNP' : ev.kind === 'decision' ? '判断' : ev.kind === 'endConfirm' ? '確定' : ''}</b>
                {ev.box && <span>{ev.box}番</span>}
                <span className="rounded bg-slate-200 px-1 dark:bg-slate-700">{M.THROW_RESULT_LABEL[ev.result]}</span>
                {ev.durationSec != null && <span>{ev.durationSec.toFixed(1)}秒</span>}
              </div>
              {ev.note && <div className="mt-0.5 text-slate-600 dark:text-slate-300">{ev.note}</div>}
              {ev.decision && <div className="mt-0.5 text-slate-500">→ {ev.decision.reason}</div>}
              <div className="mt-1 flex gap-1">
                <Btn small variant="ghost" onClick={() => setPreview(previewSeq === ev.seq ? null : ev.seq)}>
                  {previewSeq === ev.seq ? '再生終了' : 'この時点を表示'}
                </Btn>
                <Btn small variant="ghost" onClick={() => { setPreview(null); A.branchMatchToSandbox(ev.seq); }}>ここから分岐</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function MatchPanel() {
  const doc = useDoc();
  const profile = useProfile();
  const ui = useUI();
  if (doc.mode !== 'match' || !doc.match) {
    return (
      <Section title="試合再現">
        <p className="mb-2 text-sm">試合形式・規則版・選手を選び、投球を時系列で記録します。現在の自由配置の盤面はそのまま保存されます。</p>
        <Btn variant="primary" onClick={() => ui.openDialog('matchSetup')} testId="new-match">新しい試合を開始</Btn>
      </Section>
    );
  }
  const m = doc.match;
  const end = M.currentEndRecord(m);
  const mt = profile.matchTypes[m.setup.matchType];
  const cls = profile.classes[m.setup.matchType].find((c) => c.code === m.setup.classCode);
  return (
    <div>
      <div className="mb-2 rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
        <div className="font-bold">
          {profile.shortName} ／ {MATCH_TYPE_LABEL[m.setup.matchType]}
          {cls ? ` ／ ${cls.label}` : ''} ／ 全{m.setup.numEnds}エンド ／ 現在：{endLabel(end)}
        </div>
        {mt.endsProvisional && <div className="text-amber-700 dark:text-amber-300">エンド数・ジャック担当順は通常版からの初期提案／大会要確認</div>}
        <div className="mt-1 flex gap-2">
          <Btn small variant="ghost" onClick={() => ui.openDialog('matchSetup')}>試合設定</Btn>
        </div>
      </div>
      {m.phase !== 'finished' && <Clocks />}
      {m.phase === 'jack' && <JackPhase />}
      {m.phase === 'color' && <ColorPhase />}
      {m.phase === 'endScoring' && <ScoringPhase key={m.currentEnd} />}
      {m.phase === 'tiebreakSetup' && <TiebreakSetup />}
      <ScoreTable />
      <History />
    </div>
  );
}
