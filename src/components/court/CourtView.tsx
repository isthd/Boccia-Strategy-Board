// 操作可能なコート表示。Pointer Events でタップ追加・1本指ドラッグ・ピンチズーム・パンを扱う。
// 画面座標はズーム・パンの表示変換にのみ使い、球の座標は常にメートル単位で保持する。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUI, type ViewTransform } from '../../store/uiStore';
import { useBoard, useDoc, useOverlaps, useProfile, useScore } from '../../store/derived';
import { useDocStore } from '../../store/docStore';
import * as A from '../../store/actions';
import { CourtContent } from './CourtContent';
import type { Ball, Vec } from '../../domain/types';
import { boxAt, boxCenter, closestPointOnSegment, distance } from '../../domain/geometry';
import { newId } from '../../domain/document';
import { clamp } from '../../domain/numeric';

const MARGIN = 0.6;
const MIN_K = 0.6;
const MAX_K = 40;
const TAP_SLOP = 8; // px

type Gesture =
  | { kind: 'none' }
  | { kind: 'pending'; id: number; sx: number; sy: number; world: Vec; view: ViewTransform; moved: boolean }
  | { kind: 'ball'; id: number; ballId: string; offset: Vec; sx: number; sy: number; moved: boolean; tapWorld: Vec | null }
  | { kind: 'annot'; id: number; annId: string; handle: 'body' | 'from' | 'to'; start: Vec; orig: unknown; sx: number; sy: number; moved: boolean }
  | { kind: 'pinch'; d0: number; view0: ViewTransform; w0: Vec };

export function CourtView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 800 });
  const doc = useDoc();
  const court = doc.court;
  const { board, preview } = useBoard();
  const profile = useProfile();
  const score = useScore();
  const overlaps = useOverlaps();
  const ui = useUI();
  const { view, display, tool } = ui;

  const vb = useMemo(() => ({ x: -MARGIN, y: -MARGIN, w: court.width + 2 * MARGIN, h: court.length + 2 * MARGIN }), [court.width, court.length]);
  const s0 = Math.min(size.w / vb.w, size.h / vb.h);
  const ox = (size.w - vb.w * s0) / 2;
  const oy = (size.h - vb.h * s0) / 2;
  const pxPerM = s0 * view.k;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);

  // 座標変換（画面px → ビューボックス → ワールドm）
  const geo = useRef({ s0, ox, oy, vb, view });
  geo.current = { s0, ox, oy, vb, view };
  const toU = (sx: number, sy: number) => {
    const g = geo.current;
    return { x: (sx - g.ox) / g.s0 + g.vb.x, y: (sy - g.oy) / g.s0 + g.vb.y };
  };
  const toWorld = (sx: number, sy: number, v = geo.current.view): Vec => {
    const u = toU(sx, sy);
    return { x: (u.x - v.tx) / v.k, y: (u.y - v.ty) / v.k };
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const pointers = useRef(new Map<number, { sx: number; sy: number }>());
  const gesture = useRef<Gesture>({ kind: 'none' });

  const zoomAt = useCallback((sx: number, sy: number, k: number, base = geo.current.view) => {
    const nk = clamp(k, MIN_K, MAX_K);
    const w = toWorld(sx, sy, base);
    const u = toU(sx, sy);
    useUI.getState().setView({ k: nk, tx: u.x - nk * w.x, ty: u.y - nk * w.y });
  }, []);

  const hitBall = (p: Vec, radiusPx: number): Ball | null => {
    const g = geo.current;
    const ppm = g.s0 * g.view.k;
    let best: Ball | null = null;
    let bestD = Infinity;
    for (const b of board.balls) {
      if (b.status === 'available') continue;
      const d = distance(p, b);
      const hr = Math.max(b.radius, radiusPx / ppm);
      if (d <= hr && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  };

  const hitAnnotation = (p: Vec): { id: string; handle: 'body' | 'from' | 'to' } | null => {
    const g = geo.current;
    const hr = 20 / (g.s0 * g.view.k);
    for (let i = board.annotations.length - 1; i >= 0; i--) {
      const a = board.annotations[i];
      if (a.type === 'arrow') {
        if (distance(p, a.to) <= hr) return { id: a.id, handle: 'to' };
        if (distance(p, a.from) <= hr) return { id: a.id, handle: 'from' };
        if (closestPointOnSegment(p, a.from, a.to).dist <= hr * 0.6) return { id: a.id, handle: 'body' };
      } else if (distance(p, a) <= hr) return { id: a.id, handle: 'body' };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const { sx, sy } = local(e);
    pointers.current.set(e.pointerId, { sx, sy });
    if (pointers.current.size === 2) {
      // ピンチ開始：進行中のドラッグは確定
      const g = gesture.current;
      if (g.kind === 'ball' || g.kind === 'annot') useDocStore.getState().endGesture('移動');
      const [a, b] = [...pointers.current.values()];
      const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 };
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, view0: { ...geo.current.view }, w0: toWorld(mid.sx, mid.sy) };
      return;
    }
    if (pointers.current.size > 2) return;
    const w = toWorld(sx, sy);
    const st = useUI.getState();
    if (!preview && (st.tool === 'select' || st.tool === 'jack' || st.tool === 'red' || st.tool === 'blue' || st.tool === 'target')) {
      const hb = st.tool === 'target' ? null : hitBall(w, 22);
      if (hb) {
        // 球ツールでは「ドラッグ＝既存球の移動」「タップ＝新しい球の追加」（既存球の近くにも置ける）
        const isAddTool = st.tool !== 'select';
        if (!isAddTool) st.select(hb.id);
        useDocStore.getState().beginGesture();
        gesture.current = { kind: 'ball', id: e.pointerId, ballId: hb.id, offset: { x: hb.x - w.x, y: hb.y - w.y }, sx, sy, moved: false, tapWorld: isAddTool ? w : null };
        return;
      }
      const ha = hitAnnotation(w);
      if (ha) {
        const a = board.annotations.find((x) => x.id === ha.id)!;
        st.select(a.id);
        useDocStore.getState().beginGesture();
        gesture.current = { kind: 'annot', id: e.pointerId, annId: a.id, handle: ha.handle, start: w, orig: JSON.parse(JSON.stringify(a)), sx, sy, moved: false };
        return;
      }
    }
    gesture.current = { kind: 'pending', id: e.pointerId, sx, sy, world: w, view: { ...geo.current.view }, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const { sx, sy } = local(e);
    pointers.current.set(e.pointerId, { sx, sy });
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 };
      const nk = clamp(g.view0.k * (d / g.d0), MIN_K, MAX_K);
      const u = toU(mid.sx, mid.sy);
      useUI.getState().setView({ k: nk, tx: u.x - nk * g.w0.x, ty: u.y - nk * g.w0.y });
      return;
    }
    if (g.kind === 'none' || g.kind === 'pinch' || g.id !== e.pointerId) return;
    const movedPx = Math.hypot(sx - g.sx, sy - g.sy);
    if (!g.moved && movedPx < TAP_SLOP) return;
    g.moved = true;
    const w = toWorld(sx, sy);
    if (g.kind === 'ball') {
      if (g.tapWorld) useUI.getState().select(g.ballId);
      A.dragBall(g.ballId, { x: w.x + g.offset.x, y: w.y + g.offset.y });
    } else if (g.kind === 'annot') {
      const dx = w.x - g.start.x;
      const dy = w.y - g.start.y;
      const o = g.orig as { type: string; x?: number; y?: number; from?: Vec; to?: Vec };
      if (o.type === 'arrow') {
        if (g.handle === 'to') A.dragAnnotation(g.annId, { to: { x: o.to!.x + dx, y: o.to!.y + dy } });
        else if (g.handle === 'from') A.dragAnnotation(g.annId, { from: { x: o.from!.x + dx, y: o.from!.y + dy }, fromBox: null });
        else A.dragAnnotation(g.annId, { from: { x: o.from!.x + dx, y: o.from!.y + dy }, to: { x: o.to!.x + dx, y: o.to!.y + dy }, fromBox: null });
      } else A.dragAnnotation(g.annId, { x: o.x! + dx, y: o.y! + dy });
    } else if (g.kind === 'pending') {
      // 余白ドラッグ → パン
      const s = geo.current.s0;
      useUI.getState().setView({ k: g.view.k, tx: g.view.tx + (sx - g.sx) / s, ty: g.view.ty + (sy - g.sy) / s });
    }
  };

  const onTap = (w: Vec) => {
    const st = useUI.getState();
    if (preview) return;
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
      const hb = hitBall(w, 22);
      if (hb) return void A.removeBall(hb.id);
      const ha = hitAnnotation(w);
      if (ha) void A.removeAnnotation(ha.id);
      return;
    }
    if (t === 'measure') {
      const hb = hitBall(w, 18);
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
      const hb = hitBall(w, 16);
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
  };

  const endPointer = (e: React.PointerEvent, cancelled = false) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    const g = gesture.current;
    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'none' || g.id !== e.pointerId) return;
    gesture.current = { kind: 'none' };
    if (g.kind === 'ball') {
      if (g.moved && !cancelled) A.finishDrag(g.ballId);
      else {
        useDocStore.getState().cancelGesture();
        if (g.tapWorld && !cancelled) onTap(g.tapWorld);
      }
      return;
    }
    if (g.kind === 'annot') {
      if (g.moved && !cancelled) useDocStore.getState().endGesture('作図を移動');
      else useDocStore.getState().cancelGesture();
      return;
    }
    if (g.kind === 'pending' && !g.moved && !cancelled) onTap(g.world);
  };

  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = local(e);
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(sx, sy, geo.current.view.k * f);
  };

  // iOS Safari のページ全体ズーム（ジェスチャー）を抑止
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const prevent = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('gesturechange', prevent);
    el.addEventListener('touchmove', prevent, { passive: false });
    const wheel = (ev: WheelEvent) => ev.preventDefault();
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
      el.removeEventListener('touchmove', prevent);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  const fit = () => ui.setView({ k: 1, tx: 0, ty: 0 });
  const focusJack = () => {
    const j = board.balls.find((b) => b.kind === 'jack' && b.status !== 'available');
    const c = j ?? court.cross;
    const k = 4.5;
    ui.setView({ k, tx: vb.x + vb.w / 2 - k * c.x, ty: vb.y + vb.h / 2 - k * c.y });
  };
  const zoomBtn = (f: number) => zoomAt(size.w / 2, size.h / 2, view.k * f);

  const overlapIds = useMemo(() => new Set(overlaps.flat()), [overlaps]);
  const showTargetBox = display.showTargetBox ?? profile.showTargetBox;

  const cursor = tool === 'select' ? 'default' : tool === 'delete' ? 'not-allowed' : 'crosshair';

  return (
    <div ref={wrapRef} className="court-wrap relative h-full w-full overflow-hidden bg-slate-700 dark:bg-slate-900" data-testid="court">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full select-none"
        style={{ touchAction: 'none', cursor }}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e)}
        onPointerCancel={(e) => endPointer(e, true)}
        onWheel={onWheel}
        role="application"
        aria-label="ボッチャコート。球ツールを選んでタップで追加、球をドラッグで移動、2本指でズーム。"
        data-pxperm={pxPerM}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <CourtContent
            court={court}
            board={board}
            pxPerM={pxPerM}
            showTargetBox={showTargetBox}
            showNumbers={display.showNumbers}
            showGrid={display.showGrid}
            ballOpacity={display.ballOpacity}
            showDistances={display.showDistances}
            showHalo={display.showHalo}
            showContacts={display.showContacts}
            showInvalidArea={display.showInvalidArea}
            selectedId={ui.selectedId}
            pendingId={doc.match?.pendingBallId ?? null}
            score={score}
            overlapIds={overlapIds}
            measure={tool === 'measure' ? ui.measure : undefined}
            arrowStart={tool === 'arrow' ? ui.arrowStart?.p ?? null : null}
          />
        </g>
      </svg>

      {preview && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-amber-400 px-4 py-1 text-sm font-bold text-black shadow">
          投球履歴の再生中（閲覧のみ）
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex flex-row gap-2">
        <button className="zoom-btn" onClick={() => zoomBtn(1.4)} aria-label="拡大">＋</button>
        <button className="zoom-btn" onClick={() => zoomBtn(1 / 1.4)} aria-label="縮小">－</button>
        <button className="zoom-btn text-xs" onClick={focusJack} aria-label="ジャック周辺を拡大">J周辺</button>
        <button className="zoom-btn text-xs" onClick={fit} aria-label="全体表示">全体</button>
      </div>
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/40 px-2 py-0.5 text-[11px] text-white">
        ×{view.k.toFixed(1)}
      </div>
    </div>
  );
}
