// 3D表示のコート。three.js で描く。
// 床（コートの線・作図・距離線・選択リングなど）は 2D と同じ CourtContent を画像化して貼り、球だけを立体の球として置く。
// 座標の対応：ワールド x(m) → three の X、ワールド y(m) → three の Z、高さ → three の Y。
// 操作：球をドラッグで移動、タップで各ツールの操作、余白の1本指ドラッグで視点を回す、2本指でズーム・移動。
import { useEffect, useLayoutEffect, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useUI } from '../../store/uiStore';
import { useBoard, useDoc, useHand, useOverlaps, useProfile, useScore } from '../../store/derived';
import { useDocStore } from '../../store/docStore';
import * as A from '../../store/actions';
import { CourtContent, PALETTE } from './CourtContent';
import { handleCourtTap, hitAnnotationAt, hitBallAt } from './courtInteraction';
import type { Ball, Board, CourtConfig, Vec } from '../../domain/types';

/** 床の画像に含めるコート外の余白(m) */
const MARGIN = 0.6;
/** 床の文字・線の太さの基準（書き出しと同じ） */
const LABEL_PX_PER_M = 170;
/** 床画像の解像度（1mあたりの画素数） */
const TEX_PX_PER_M = 200;
const TAP_SLOP = 8;

type Preset = 'player' | 'overview' | 'top' | 'side' | 'jack';

const PRESETS: { id: Preset; label: React.ReactNode; title: string }[] = [
  { id: 'player', label: '選手', title: 'スローイングボックスから見た選手の目線' },
  { id: 'overview', label: '俯瞰', title: 'コートを斜め上から見る' },
  { id: 'top', label: '真上', title: '真上から見る' },
  { id: 'side', label: '横', title: 'コートの横から見る' },
  { id: 'jack', label: <>J<br />周辺</>, title: 'ジャックの近くから見る' },
];

function presetPose(p: Preset, court: CourtConfig, board: Board): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const W = court.width;
  const L = court.length;
  const c = court.cross;
  const jack = board.balls.find((b) => b.kind === 'jack' && b.status !== 'available');
  switch (p) {
    case 'player':
      return { pos: new THREE.Vector3(W / 2, 1.25, L - 0.9), target: new THREE.Vector3(c.x, 0, c.y) };
    case 'top':
      return { pos: new THREE.Vector3(W / 2, 15.5, L / 2 + 0.001), target: new THREE.Vector3(W / 2, 0, L / 2) };
    case 'side':
      return { pos: new THREE.Vector3(W + 4.5, 3.2, c.y + 0.5), target: new THREE.Vector3(c.x, 0, c.y) };
    case 'jack': {
      const j = jack ?? c;
      return { pos: new THREE.Vector3(j.x, 0.9, j.y + 1.3), target: new THREE.Vector3(j.x, 0, j.y) };
    }
    default:
      return { pos: new THREE.Vector3(W / 2, 6.5, L + 3.2), target: new THREE.Vector3(W / 2, 0, c.y + 0.6) };
  }
}

const ballColor = (b: Ball) => (b.kind === 'jack' ? PALETTE.jack : b.side === 'red' ? PALETTE.red : PALETTE.blue);

interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  balls: Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>;
  /** 試合再現：ボックスに並べた手持ちの球 */
  hand: Map<string, THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>>;
  sphere: THREE.SphereGeometry;
  dirty: boolean;
  anim: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null;
}

export default function Court3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const doc = useDoc();
  const court = doc.court;
  const { board, preview } = useBoard();
  const profile = useProfile();
  const score = useScore();
  const overlaps = useOverlaps();
  const hand = useHand();
  const ui = useUI();
  const { display, tool } = ui;
  const showTargetBox = display.showTargetBox ?? profile.showTargetBox;

  // 最新の値をイベント処理から参照するため
  const live = useRef({ board, court, preview: !!preview });
  live.current = { board, court, preview: !!preview };

  // ---- 初期化 ----
  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.className = 'absolute inset-0 h-full w-full select-none';
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'ボッチャコートの3D表示。球をドラッグで移動、余白のドラッグで視点を回転、2本指でズーム。');
    wrap.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#334155');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

    scene.add(new THREE.HemisphereLight('#ffffff', '#64748b', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(-4, 12, 3);
    sun.target.position.set(3, 0, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // 体育館の床（コートの外）
    const gym = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#b08a5a', roughness: 0.8 }));
    gym.rotation.x = -Math.PI / 2;
    gym.position.set(3, -0.003, 6);
    gym.receiveShadow = true;
    scene.add(gym);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.minDistance = 0.25;
    controls.maxDistance = 35;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    const eng: Engine = { renderer, scene, camera, controls, floor, balls: new Map(), hand: new Map(), sphere: new THREE.SphereGeometry(1, 40, 28), dirty: true, anim: null };
    engineRef.current = eng;
    controls.addEventListener('change', () => (eng.dirty = true));

    const { board: b0, court: c0 } = live.current;
    const pose = presetPose('overview', c0, b0);
    camera.position.copy(pose.pos);
    controls.target.copy(pose.target);
    controls.update();

    const resize = () => {
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      eng.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (eng.anim) {
        const t = Math.min(1, (now - eng.anim.start) / 450);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        camera.position.lerpVectors(eng.anim.from, eng.anim.to, e);
        controls.target.lerpVectors(eng.anim.tFrom, eng.anim.tTo, e);
        eng.dirty = true;
        if (t >= 1) eng.anim = null;
      }
      if (controls.update()) eng.dirty = true;
      if (eng.dirty) {
        eng.dirty = false;
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      floor.material.map?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
      canvas.remove();
      engineRef.current = null;
    };
  }, []);

  // ---- 手持ちの球（ボックス内） ----
  useEffect(() => {
    const eng = engineRef.current!;
    const seen = new Set<string>();
    for (const h of hand) {
      seen.add(h.ball.id);
      let m = eng.hand.get(h.ball.id);
      if (!m) {
        m = new THREE.Mesh(eng.sphere, new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
        m.castShadow = true;
        m.userData.handBallId = h.ball.id;
        eng.scene.add(m);
        eng.hand.set(h.ball.id, m);
      }
      m.material.color.set(ballColor(h.ball));
      m.scale.setScalar(h.ball.radius);
      m.position.set(h.x, h.ball.radius, h.y);
    }
    for (const [id, m] of eng.hand) {
      if (!seen.has(id)) {
        eng.scene.remove(m);
        m.material.dispose();
        eng.hand.delete(id);
      }
    }
    eng.dirty = true;
  }, [hand]);

  // ---- 床の大きさ ----
  useEffect(() => {
    const eng = engineRef.current!;
    const w = court.width + 2 * MARGIN;
    const h = court.length + 2 * MARGIN;
    eng.floor.scale.set(w, h, 1);
    eng.floor.position.set(court.width / 2, 0, court.length / 2);
    eng.dirty = true;
  }, [court.width, court.length]);

  // ---- 球 ----
  useEffect(() => {
    const eng = engineRef.current!;
    const seen = new Set<string>();
    for (const b of board.balls) {
      if (b.status === 'available') continue;
      seen.add(b.id);
      let m = eng.balls.get(b.id);
      if (!m) {
        m = new THREE.Mesh(eng.sphere, new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
        m.castShadow = true;
        m.userData.ballId = b.id;
        eng.scene.add(m);
        eng.balls.set(b.id, m);
      }
      const inactive = b.status !== 'inPlay';
      const opacity = (inactive ? 0.4 : 1) * display.ballOpacity;
      m.material.color.set(ballColor(b));
      m.material.transparent = opacity < 1;
      m.material.opacity = opacity;
      m.material.depthWrite = opacity >= 1;
      m.castShadow = !inactive;
      m.scale.setScalar(b.radius);
      m.position.set(b.x, b.radius, b.y);
    }
    for (const [id, m] of eng.balls) {
      if (!seen.has(id)) {
        eng.scene.remove(m);
        m.material.dispose();
        eng.balls.delete(id);
      }
    }
    eng.dirty = true;
  }, [board.balls, display.ballOpacity]);

  // ---- 床の画像（2Dと同じ描画を画像化）。連続で変わるときは描画中の分が終わってから最新で描き直す ----
  const texState = useRef({ busy: false, again: false });
  const floorSvg = (() => {
    const overlapIds = new Set(overlaps.flat());
    const inner = renderToStaticMarkup(
      <CourtContent
        court={court}
        board={board}
        pxPerM={LABEL_PX_PER_M}
        showTargetBox={showTargetBox}
        showNumbers={display.showNumbers}
        showGrid={display.showGrid}
        ballOpacity={display.ballOpacity}
        showDistances={display.showDistances}
        showHalo={false}
        showContacts={display.showContacts}
        showInvalidArea={display.showInvalidArea}
        selectedId={ui.selectedId}
        pendingId={doc.match?.pendingBallId ?? null}
        score={score}
        overlapIds={overlapIds}
        measure={tool === 'measure' ? ui.measure : undefined}
        arrowStart={tool === 'arrow' ? ui.arrowStart?.p ?? null : null}
        ballBodies={false}
        minBallPx={0}
      />,
    );
    const vw = court.width + 2 * MARGIN;
    const vh = court.length + 2 * MARGIN;
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vw * TEX_PX_PER_M)}" height="${Math.round(vh * TEX_PX_PER_M)}" viewBox="${-MARGIN} ${-MARGIN} ${vw} ${vh}" font-family="'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif">${inner}</svg>`,
      w: Math.round(vw * TEX_PX_PER_M),
      h: Math.round(vh * TEX_PX_PER_M),
    };
  })();
  const latestSvg = useRef(floorSvg);
  latestSvg.current = floorSvg;

  useEffect(() => {
    const st = texState.current;
    if (st.busy) {
      st.again = true;
      return;
    }
    const draw = () => {
      const eng = engineRef.current;
      if (!eng) return;
      st.busy = true;
      const { svg, w, h } = latestSvg.current;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      const done = () => {
        URL.revokeObjectURL(url);
        st.busy = false;
        if (st.again) {
          st.again = false;
          draw();
        }
      };
      img.onload = () => {
        const e = engineRef.current;
        if (e) {
          let tex = e.floor.material.map as THREE.CanvasTexture | null;
          let cv = tex?.image as HTMLCanvasElement | undefined;
          if (!tex || !cv || cv.width !== w || cv.height !== h) {
            tex?.dispose();
            cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = e.renderer.capabilities.getMaxAnisotropy();
            e.floor.material.map = tex;
            e.floor.material.needsUpdate = true;
          }
          const ctx = cv.getContext('2d')!;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          tex.needsUpdate = true;
          e.dirty = true;
        }
        done();
      };
      img.onerror = done;
      img.src = url;
    };
    draw();
  }, [floorSvg.svg]);

  // ---- 操作 ----
  useEffect(() => {
    const eng = engineRef.current!;
    const canvas = eng.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointers = new Set<number>();
    type G =
      | { kind: 'none' }
      | { kind: 'empty'; id: number; sx: number; sy: number; moved: boolean }
      | { kind: 'hand'; id: number; ballId: string; home: THREE.Vector3; sx: number; sy: number; moved: boolean }
      | { kind: 'ball'; id: number; ballId: string; offset: Vec; height: number; sx: number; sy: number; moved: boolean; tapWorld: Vec | null };
    let g: G = { kind: 'none' };

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { sx: e.clientX - r.left, sy: e.clientY - r.top, r };
    };
    const setRay = (sx: number, sy: number, r: DOMRect) => {
      ndc.set((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1);
      ray.setFromCamera(ndc, eng.camera);
    };
    /** 高さ h の水平面と視線の交点（ワールド座標 m） */
    const onPlane = (h: number): Vec | null => {
      const p = new THREE.Vector3();
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), p);
      return hit ? { x: p.x, y: p.z } : null;
    };
    /** 交点付近での画面1pxあたりのm */
    const mppAt = (w: Vec, r: DOMRect) => {
      const d = eng.camera.position.distanceTo(new THREE.Vector3(w.x, 0, w.y));
      return (2 * d * Math.tan(THREE.MathUtils.degToRad(eng.camera.fov / 2))) / r.height;
    };
    const pickBall = (w: Vec | null, r: DOMRect, px: number): Ball | null => {
      const { board: bd } = live.current;
      const hits = ray.intersectObjects([...eng.balls.values()], false);
      if (hits.length) {
        const id = hits[0].object.userData.ballId as string;
        const b = bd.balls.find((x) => x.id === id);
        if (b) return b;
      }
      return w ? hitBallAt(bd.balls, w, px * mppAt(w, r)) : null;
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        // 2本指はズーム・移動（OrbitControls に任せる）。進行中のドラッグは確定
        if (g.kind === 'ball') {
          if (g.moved) A.finishDrag(g.ballId);
          else useDocStore.getState().cancelGesture();
          eng.controls.enabled = true;
        }
        if (g.kind === 'hand') {
          eng.hand.get(g.ballId)?.position.copy(g.home);
          eng.controls.enabled = true;
          eng.dirty = true;
        }
        g = { kind: 'none' };
        return;
      }
      eng.anim = null;
      const { sx, sy, r } = local(e);
      setRay(sx, sy, r);
      const w = onPlane(0);
      const st = useUI.getState();
      const t = st.tool;
      // ボックスの手持ち球：ドラッグしてコートに置く
      if (!live.current.preview && t !== 'delete' && t !== 'measure' && t !== 'arrow') {
        const hh = ray.intersectObjects([...eng.hand.values()], false)[0];
        if (hh) {
          eng.controls.enabled = false;
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          g = { kind: 'hand', id: e.pointerId, ballId: hh.object.userData.handBallId as string, home: hh.object.position.clone(), sx, sy, moved: false };
          return;
        }
      }
      if (!live.current.preview && (t === 'select' || t === 'jack' || t === 'red' || t === 'blue')) {
        const hb = pickBall(w, r, 22);
        if (hb) {
          const isAdd = t !== 'select';
          if (!isAdd) st.select(hb.id);
          const hp = onPlane(hb.radius) ?? { x: hb.x, y: hb.y };
          useDocStore.getState().beginGesture();
          eng.controls.enabled = false;
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          g = { kind: 'ball', id: e.pointerId, ballId: hb.id, offset: { x: hb.x - hp.x, y: hb.y - hp.y }, height: hb.radius, sx, sy, moved: false, tapWorld: isAdd ? w : null };
          return;
        }
      }
      g = { kind: 'empty', id: e.pointerId, sx, sy, moved: false };
    };

    const onMove = (e: PointerEvent) => {
      if (g.kind === 'none' || g.id !== e.pointerId) return;
      const { sx, sy, r } = local(e);
      if (!g.moved && Math.hypot(sx - g.sx, sy - g.sy) < TAP_SLOP) return;
      g.moved = true;
      if (g.kind === 'hand') {
        setRay(sx, sy, r);
        const m = eng.hand.get(g.ballId);
        const p = m && onPlane(m.scale.x);
        if (m && p) {
          m.position.set(p.x, m.scale.x, p.y);
          eng.dirty = true;
        }
      } else if (g.kind === 'ball') {
        setRay(sx, sy, r);
        const p = onPlane(g.height);
        if (!p) return;
        if (g.tapWorld) useUI.getState().select(g.ballId);
        A.dragBall(g.ballId, { x: p.x + g.offset.x, y: p.y + g.offset.y });
      }
    };

    const onUp = (e: PointerEvent, cancelled = false) => {
      pointers.delete(e.pointerId);
      if (g.kind === 'none' || g.id !== e.pointerId) return;
      const cur = g;
      g = { kind: 'none' };
      const { sx, sy, r } = local(e);
      const { board: bd, court: ct, preview: pv } = live.current;
      if (cur.kind === 'hand') {
        eng.controls.enabled = true;
        const m = eng.hand.get(cur.ballId);
        const p = m ? { x: m.position.x, y: m.position.z } : null;
        if (m) {
          m.position.copy(cur.home);
          eng.dirty = true;
        }
        if (!cur.moved || cancelled) {
          if (!cancelled) useUI.getState().toast('ボックスの球はコートまでドラッグすると置けます');
          return;
        }
        if (p && p.y < ct.playingLength) {
          const id = A.placeHandBall(cur.ballId, p);
          if (id) useUI.getState().select(id);
        }
        return;
      }
      if (cur.kind === 'ball') {
        eng.controls.enabled = true;
        if (cur.moved && !cancelled) A.finishDrag(cur.ballId);
        else {
          useDocStore.getState().cancelGesture();
          if (cur.tapWorld && !cancelled) handleCourtTap(cur.tapWorld, { board: bd, court: ct, preview: pv, mpp: mppAt(cur.tapWorld, r) });
        }
        return;
      }
      if (cur.moved || cancelled) return;
      setRay(sx, sy, r);
      const w = onPlane(0);
      if (!w) return;
      const mpp = mppAt(w, r);
      const st = useUI.getState();
      if (st.tool === 'select' && !pv) {
        const ha = hitAnnotationAt(bd, w, 20 * mpp);
        if (ha) return void st.select(ha.id);
      }
      const hb = st.tool === 'target' ? null : pickBall(w, r, st.tool === 'delete' ? 22 : 18);
      handleCourtTap(w, { board: bd, court: ct, preview: pv, mpp, hitBall: hb });
    };
    const up = (e: PointerEvent) => onUp(e);
    const cancel = (e: PointerEvent) => onUp(e, true);

    const wrap = wrapRef.current!;
    // OrbitControls（canvas に登録）より先に受け取るため、親要素の capture で登録
    wrap.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    const prevent = (ev: Event) => ev.preventDefault();
    wrap.addEventListener('gesturestart', prevent);
    wrap.addEventListener('gesturechange', prevent);
    wrap.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      wrap.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      wrap.removeEventListener('gesturestart', prevent);
      wrap.removeEventListener('gesturechange', prevent);
      wrap.removeEventListener('touchmove', prevent);
    };
  }, []);

  const goPreset = (p: Preset) => {
    const eng = engineRef.current;
    if (!eng) return;
    const pose = presetPose(p, court, board);
    eng.anim = { from: eng.camera.position.clone(), to: pose.pos, tFrom: eng.controls.target.clone(), tTo: pose.target, start: performance.now() };
    eng.dirty = true;
  };

  const cursor = tool === 'select' ? 'grab' : tool === 'delete' ? 'not-allowed' : 'crosshair';

  return (
    <div className="absolute inset-0" data-testid="court-3d">
      <div ref={wrapRef} className="absolute inset-0" style={{ cursor }} />
      <div className="absolute bottom-2 right-2 flex flex-col items-center gap-1.5 rounded-full bg-slate-900/40 p-1" role="group" aria-label="3Dの視点">
        {PRESETS.map((p) => (
          <button key={p.id} className="zoom-btn text-[11px] leading-tight" onClick={() => goPreset(p.id)} aria-label={p.title} title={p.title} data-testid={`view3d-${p.id}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[11px] leading-snug text-white">
        1本指：視点を回す／2本指：ズーム・移動
      </div>
    </div>
  );
}
