// 2D・3D表示で共通の当たり判定とタップ処理。座標はすべてワールド座標（m）。
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import type { Ball, Board, CourtConfig, Vec } from '../../domain/types';
import { boxAt, boxCenter, closestPointOnSegment, distance } from '../../domain/geometry';
import { newId } from '../../domain/document';

/** p に最も近い球。minR は指で押しやすくするための最小当たり半径(m) */
export function hitBallAt(balls: Ball[], p: Vec, minR: number): Ball | null {
  let best: Ball | null = null;
  let bestD = Infinity;
  for (const b of balls) {
    if (b.status === 'available') continue;
    const d = distance(p, b);
    if (d <= Math.max(b.radius, minR) && d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

export type AnnotHit = { id: string; handle: 'body' | 'from' | 'to' };

export function hitAnnotationAt(board: Board, p: Vec, hr: number): AnnotHit | null {
  for (let i = board.annotations.length - 1; i >= 0; i--) {
    const a = board.annotations[i];
    if (a.type === 'arrow') {
      if (distance(p, a.to) <= hr) return { id: a.id, handle: 'to' };
      if (distance(p, a.from) <= hr) return { id: a.id, handle: 'from' };
      if (closestPointOnSegment(p, a.from, a.to).dist <= hr * 0.6) return { id: a.id, handle: 'body' };
    } else if (distance(p, a) <= hr) return { id: a.id, handle: 'body' };
  }
  return null;
}

/**
 * コートのタップ（指を動かさずに離した）を選択中のツールに応じて処理する。
 * mpp は画面1pxあたりのm（当たり判定の大きさに使う）。
 */
export function handleCourtTap(w: Vec, ctx: { board: Board; court: CourtConfig; preview: boolean; mpp: number; hitBall?: Ball | null }) {
  const { board, court, preview, mpp } = ctx;
  const st = useUI.getState();
  if (preview) return;
  const hit = (px: number) => (ctx.hitBall !== undefined ? ctx.hitBall : hitBallAt(board.balls, w, px * mpp));
  const t = st.tool;
  if (t === 'jack' || t === 'red' || t === 'blue') {
    const id = A.addBallAt(t, w);
    if (id) st.select(id);
    return;
  }
  if (t === 'select') {
    st.select(null);
    return;
  }
  if (t === 'delete') {
    const hb = hit(22);
    if (hb) return void A.removeBall(hb.id);
    const ha = hitAnnotationAt(board, w, 20 * mpp);
    if (ha) void A.removeAnnotation(ha.id);
    return;
  }
  if (t === 'measure') {
    const hb = hit(18);
    const p = hb ? { x: hb.x, y: hb.y } : w;
    st.setMeasure(st.measure.length >= 2 ? [p] : [...st.measure, p]);
    return;
  }
  if (t === 'target') {
    const n = board.annotations.filter((a) => a.type === 'target').length + 1;
    const id = newId('a');
    A.addAnnotation({ id, type: 'target', x: w.x, y: w.y, name: `目標${n}`, priority: 2, memo: '', color: '#16a34a' });
    st.select(id);
    return;
  }
  if (t === 'text') {
    void st.prompt({ title: '注釈テキスト', label: 'コート上に表示するテキスト', multiline: false }).then((text) => {
      if (text) {
        const id = newId('a');
        A.addAnnotation({ id, type: 'text', x: w.x, y: w.y, text, color: '#7c2d12' });
        st.select(id);
      }
    });
    return;
  }
  if (t === 'arrow') {
    const hb = hit(16);
    if (!st.arrowStart) {
      const box = boxAt(court, w);
      if (hb) st.setArrowStart({ p: { x: hb.x, y: hb.y }, box: null });
      else if (box) st.setArrowStart({ p: boxCenter(court, box), box });
      else st.setArrowStart({ p: w, box: null });
      st.toast('矢印の終点（狙う位置）をタップしてください');
    } else {
      const to = hb ? { x: hb.x, y: hb.y } : w;
      const id = newId('a');
      const n = board.annotations.filter((a) => a.type === 'arrow').length + 1;
      A.addAnnotation({ id, type: 'arrow', from: st.arrowStart.p, fromBox: st.arrowStart.box, to, name: `コース${n}`, color: '#ea580c', tags: [], memo: '' });
      st.setArrowStart(null);
      st.select(id);
    }
  }
}
