// A/B比較：2つの局面を並べて暫定得点・ジャックの移動・残り球・接触候補を比較
import { useLayoutEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Btn, Select } from '../ui';
import { useDoc, useProfile } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { CourtContent } from '../court/CourtContent';
import { computeScore } from '../../domain/scoring';
import { contactCandidates, distance, findOverlaps } from '../../domain/geometry';
import type { Variant } from '../../domain/types';
import { fmtCm } from '../../domain/numeric';

function Mini({ v }: { v: Variant }) {
  const doc = useDoc();
  const profile = useProfile();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(240);
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.clientWidth);
  }, []);
  const c = doc.court;
  const score = computeScore(v.board.balls, c, v.board.tieResolution);
  const vbW = c.width + 0.8;
  const pxPerM = w / vbW;
  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`-0.4 -0.4 ${vbW} ${c.length + 0.8}`} className="w-full rounded-lg">
        <CourtContent
          court={c}
          board={v.board}
          pxPerM={pxPerM}
          showTargetBox={profile.showTargetBox}
          showNumbers
          showGrid={false}
          ballOpacity={1}
          showDistances
          showHalo
          showContacts
          showInvalidArea
          score={score}
          overlapIds={new Set(findOverlaps(v.board.balls).flat())}
        />
      </svg>
    </div>
  );
}

function stats(v: Variant, court: ReturnType<typeof useDoc>['court']) {
  const s = computeScore(v.board.balls, court, v.board.tieResolution);
  const unplaced = { red: 0, blue: 0 };
  for (const b of v.board.balls) if (b.kind === 'color' && b.status === 'available' && b.side) unplaced[b.side]++;
  const r = v.board.balls.find((b) => b.kind === 'color')?.radius ?? 0.043;
  const contacts = v.board.annotations.filter((a) => a.type === 'arrow').reduce((n, a) => n + (a.type === 'arrow' ? contactCandidates(a.from, a.to, r, v.board.balls).length : 0), 0);
  return { s, unplaced, contacts, overlaps: findOverlaps(v.board.balls).length };
}

export function CompareDialog() {
  const doc = useDoc();
  const ui = useUI();
  const close = () => ui.openDialog(null);
  const [ids, setIds] = useState<[string, string]>(ui.compareIds ?? [doc.variants[0].id, doc.variants[1]?.id ?? doc.variants[0].id]);
  const a = doc.variants.find((v) => v.id === ids[0]) ?? doc.variants[0];
  const b = doc.variants.find((v) => v.id === ids[1]) ?? doc.variants[0];
  const sa = stats(a, doc.court);
  const sb = stats(b, doc.court);
  const ja = a.board.balls.find((x) => x.kind === 'jack');
  const jb = b.board.balls.find((x) => x.kind === 'jack');
  const jackMove = ja && jb && ja.status !== 'available' && jb.status !== 'available' ? distance(ja, jb) : null;
  const opts = doc.variants.map((v) => ({ value: v.id, label: v.name }));
  const row = (label: string, x: string, y: string) => (
    <tr className="border-t border-slate-100 dark:border-slate-700">
      <td className="py-1.5 text-slate-500">{label}</td>
      <td className="text-center font-semibold">{x}</td>
      <td className="text-center font-semibold">{y}</td>
    </tr>
  );
  return (
    <Modal title="A/B比較" onClose={close} wide testId="compare-dialog">
      <div className="grid grid-cols-2 gap-3">
        {[a, b].map((v, i) => (
          <div key={i}>
            <Select<string> value={v.id} options={opts} onChange={(id) => setIds(i === 0 ? [id, ids[1]] : [ids[0], id])} />
            <div className="mt-2">
              <Mini v={v} />
            </div>
            <Btn
              small
              className="mt-1 w-full"
              onClick={() => {
                A.switchVariant(v.id);
                close();
              }}
            >
              この案を編集
            </Btn>
          </div>
        ))}
      </div>
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-slate-500">
            <th />
            <th>{a.name}</th>
            <th>{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {row('暫定得点', `赤${sa.s.red}–青${sa.s.blue}`, `赤${sb.s.red}–青${sb.s.blue}`)}
          {row('暫定リード', sa.s.leader === 'red' ? '赤' : sa.s.leader === 'blue' ? '青' : '同点', sb.s.leader === 'red' ? '赤' : sb.s.leader === 'blue' ? '青' : '同点')}
          {row('最寄り球', sa.s.ranking[0] ? `${sa.s.ranking[0].side === 'red' ? '赤' : '青'}${sa.s.ranking[0].number} ${fmtCm(sa.s.ranking[0].centerDistance)}` : '–', sb.s.ranking[0] ? `${sb.s.ranking[0].side === 'red' ? '赤' : '青'}${sb.s.ranking[0].number} ${fmtCm(sb.s.ranking[0].centerDistance)}` : '–')}
          {row('未配置の球（赤／青）', `${sa.unplaced.red}／${sa.unplaced.blue}`, `${sb.unplaced.red}／${sb.unplaced.blue}`)}
          {row('矢印の接触候補', `${sa.contacts}`, `${sb.contacts}`)}
          {row('2D表示上の重なり', `${sa.overlaps}`, `${sb.overlaps}`)}
          {row('近接・要計測', sa.s.nearTie || sa.s.boundaryBallIds.length ? 'あり' : 'なし', sb.s.nearTie || sb.s.boundaryBallIds.length ? 'あり' : 'なし')}
        </tbody>
      </table>
      <p className="mt-2 text-sm">ジャックの移動距離（A→B）：{jackMove == null ? '–' : fmtCm(jackMove)}</p>
      {(a.notes.aim || b.notes.aim || a.notes.risk || b.notes.risk) && (
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          {[a, b].map((v, i) => (
            <div key={i} className="rounded border border-slate-200 p-2 dark:border-slate-700">
              <div><b>狙い：</b>{v.notes.aim || '–'}</div>
              <div><b>成功時：</b>{v.notes.success || '–'}</div>
              <div><b>リスク：</b>{v.notes.risk || '–'}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
