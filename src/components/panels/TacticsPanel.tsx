// 作戦パネル：目標点・矢印・注釈の編集、接触候補、戦術メモ
import { useBoard, useDoc } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { Btn, Note, Section, Select, TextField } from '../ui';
import { activeVariant, ballLabel } from '../../domain/document';
import { TACTIC_TAG_LABEL, type Annotation, type TacticTag } from '../../domain/types';
import { arrowAngleDeg, contactCandidates, distance } from '../../domain/geometry';

const COLORS = ['#ea580c', '#16a34a', '#9333ea', '#0891b2', '#dc2626', '#1d4ed8', '#111827'];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full border-2 ${value === c ? 'border-amber-400' : 'border-white dark:border-slate-700'}`}
          style={{ background: c }}
          aria-label={`色 ${c}`}
        />
      ))}
    </div>
  );
}

function AnnotationEditor({ a }: { a: Annotation }) {
  const { board } = useBoard();
  const upd = (p: Partial<Annotation>) => A.updateAnnotation(a.id, p);
  if (a.type === 'arrow') {
    const len = distance(a.from, a.to);
    const ang = arrowAngleDeg(a.from, a.to);
    const r = board.balls.find((b) => b.kind === 'color')?.radius ?? 0.043;
    const contacts = contactCandidates(a.from, a.to, r, board.balls);
    return (
      <div className="space-y-2">
        <TextField label="名前" value={a.name} onCommit={(name) => upd({ name })} />
        <p className="text-sm tabular-nums">
          直線距離 {len.toFixed(2)}m ／ 角度 {ang >= 0 ? '+' : ''}
          {ang.toFixed(1)}°（真正面0°、右が＋）{a.fromBox ? ` ／ 始点：${a.fromBox}番ボックス中心` : ''}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TACTIC_TAG_LABEL) as TacticTag[]).map((t) => (
            <Btn
              key={t}
              small
              active={a.tags.includes(t)}
              onClick={() => upd({ tags: a.tags.includes(t) ? a.tags.filter((x) => x !== t) : [...a.tags, t] })}
            >
              {TACTIC_TAG_LABEL[t]}
            </Btn>
          ))}
        </div>
        <ColorPicker value={a.color} onChange={(color) => upd({ color })} />
        <TextField label="メモ" value={a.memo} multiline onCommit={(memo) => upd({ memo })} />
        <div className="text-sm">
          <b>接触候補：</b>
          {contacts.length === 0 ? 'なし' : contacts.map((c) => ballLabel(board.balls.find((b) => b.id === c.ballId)!)).join(' → ')}
        </div>
        <Note>接触候補は直線経路上で球が触れうる位置にあるかの目安です。上から越える投球、曲がり、弾き、変形は計算していません。戦術タグは戦術上のメモであり、結果を保証しません。</Note>
      </div>
    );
  }
  if (a.type === 'target') {
    return (
      <div className="space-y-2">
        <TextField label="名前" value={a.name} onCommit={(name) => upd({ name })} />
        <Select<string>
          label="優先度"
          value={String(a.priority)}
          options={[
            { value: '1', label: '★ 低' },
            { value: '2', label: '★★ 中' },
            { value: '3', label: '★★★ 高' },
          ]}
          onChange={(v) => upd({ priority: Number(v) as 1 | 2 | 3 })}
        />
        <ColorPicker value={a.color} onChange={(color) => upd({ color })} />
        <TextField label="メモ" value={a.memo} multiline onCommit={(memo) => upd({ memo })} />
        <p className="text-xs text-slate-500 tabular-nums">位置 ({a.x.toFixed(3)}m, {a.y.toFixed(3)}m)</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <TextField label="テキスト" value={a.text} onCommit={(text) => upd({ text })} />
      <ColorPicker value={a.color} onChange={(color) => upd({ color })} />
    </div>
  );
}

export function TacticsPanel() {
  const doc = useDoc();
  const { board } = useBoard();
  const selectedId = useUI((s) => s.selectedId);
  const select = useUI((s) => s.select);
  const setTool = useUI((s) => s.setTool);
  const sel = board.annotations.find((a) => a.id === selectedId);
  const v = doc.mode === 'sandbox' ? activeVariant(doc) : null;

  const label = (a: Annotation) => (a.type === 'arrow' ? `➜ ${a.name}` : a.type === 'target' ? `◎ ${a.name}` : `✎ ${a.text}`);

  return (
    <div>
      <Section title="作図ツール">
        <div className="grid grid-cols-3 gap-1.5">
          <Btn small onClick={() => setTool('target')}>◎ 目標点</Btn>
          <Btn small onClick={() => setTool('arrow')}>➜ 矢印</Btn>
          <Btn small onClick={() => setTool('text')}>✎ 注釈</Btn>
        </div>
        <Note>矢印：1回目のタップで始点（スローイングボックス内をタップするとボックス中心にスナップ）、2回目で終点。作図はドラッグで移動、矢印は端点ドラッグで変形できます。</Note>
      </Section>

      {sel && (
        <Section title="選択中の作図" right={<Btn small variant="danger" onClick={() => void A.removeAnnotation(sel.id)}>削除</Btn>}>
          <AnnotationEditor a={sel} />
        </Section>
      )}

      <Section title={`作図一覧（${board.annotations.length}）`}>
        {board.annotations.length === 0 ? (
          <p className="text-sm text-slate-500">まだ作図はありません。</p>
        ) : (
          <div className="flex flex-col gap-1">
            {board.annotations.map((a) => (
              <button
                key={a.id}
                onClick={() => select(a.id)}
                className={`min-h-[40px] rounded-md border px-2 text-left text-sm ${selectedId === a.id ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/40' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <span style={{ color: a.color }}>{label(a)}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {v && (
        <Section title={`戦術メモ（${v.name}）`}>
          <div className="space-y-2">
            <TextField label="戦術名（局面名）" value={v.name} onCommit={(n) => A.renameVariant(v.id, n)} />
            <TextField label="狙い" value={v.notes.aim} multiline onCommit={(aim) => A.updateNotes({ aim })} />
            <TextField label="成功時の配置" value={v.notes.success} multiline onCommit={(success) => A.updateNotes({ success })} />
            <TextField label="失敗時のリスク" value={v.notes.risk} multiline onCommit={(risk) => A.updateNotes({ risk })} />
            <TextField label="相手の残り球" value={v.notes.opponentRemaining} onCommit={(opponentRemaining) => A.updateNotes({ opponentRemaining })} />
            <TextField label="説明・メモ" value={v.notes.memo} multiline onCommit={(memo) => A.updateNotes({ memo })} />
          </div>
        </Section>
      )}
    </div>
  );
}
