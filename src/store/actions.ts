// ユーザー操作 → 文書変更。すべて Undo/Redo 対象。
import type { Draft } from 'immer';
import { useDocStore } from './docStore';
import { useUI } from './uiStore';
import type { BoardDoc } from '../domain/document';
import { activeBoard, activeVariant, ballLabel, cloneBoard, createSandboxDoc, emptyBoard, makeColorBall, newId, newVariant, nowIso } from '../domain/document';
import type { Annotation, Ball, BallStatus, Board, RuleProfileId, Side, TieResolution, Vec } from '../domain/types';
import { sideLabel } from '../domain/types';
import { resolveOverlap } from '../domain/geometry';
import { roundTo } from '../domain/numeric';
import * as M from '../domain/match';
import { getProfile } from '../domain/rules/registry';

const doc = () => useDocStore.getState().doc!;
const apply = (label: string, fn: (d: Draft<BoardDoc>) => void) => useDocStore.getState().apply(label, fn);
const toast = (t: string, k?: 'info' | 'warn' | 'error') => useUI.getState().toast(t, k);

const boardOf = (d: Draft<BoardDoc>): Draft<Board> => activeBoard(d as BoardDoc) as Draft<Board>;

function snapPos(board: Board, ballId: string, p: Vec, radius: number): Vec {
  if (!useUI.getState().display.snap) return p;
  const others = board.balls.filter((b) => b.id !== ballId && b.status === 'inPlay');
  return resolveOverlap(p, radius, others);
}

const round = (p: Vec): Vec => ({ x: roundTo(p.x), y: roundTo(p.y) });

/** 球の追加（コートをタップ）。自由配置では未配置の球を置き、上限を超えると非公式球を追加。 */
export function addBallAt(kind: 'jack' | Side, p: Vec): string | null {
  const d = doc();
  const board = activeBoard(d);
  if (d.mode === 'match' && d.match) return addMatchBallAt(kind, p);
  let placedId: string | null = null;
  if (kind === 'jack') {
    const jack = board.balls.find((b) => b.kind === 'jack');
    if (!jack) return null;
    const pos = round(snapPos(board, jack.id, p, jack.radius));
    apply(jack.status === 'available' ? 'ジャックを配置' : 'ジャックを移動', (dd) => {
      const j = boardOf(dd).balls.find((b) => b.kind === 'jack')!;
      j.x = pos.x;
      j.y = pos.y;
      j.status = 'inPlay';
    });
    return jack.id;
  }
  const avail = board.balls.filter((b) => b.kind === 'color' && b.side === kind && b.status === 'available').sort((a, b) => a.number - b.number)[0];
  if (avail) {
    const pos = round(snapPos(board, avail.id, p, avail.radius));
    apply(`${ballLabel(avail)}を配置`, (dd) => {
      const b = boardOf(dd).balls.find((x) => x.id === avail.id)!;
      b.x = pos.x;
      b.y = pos.y;
      b.status = 'inPlay';
    });
    placedId = avail.id;
  } else {
    const maxNo = Math.max(0, ...board.balls.filter((b) => b.side === kind).map((b) => b.number));
    const nb = makeColorBall(kind, maxNo + 1, { unofficial: true, status: 'inPlay' });
    nb.id = `${kind}-${maxNo + 1}-${newId().slice(0, 6)}`;
    const pos = round(snapPos(board, nb.id, p, nb.radius));
    nb.x = pos.x;
    nb.y = pos.y;
    apply(`${ballLabel(nb)}（非公式）を追加`, (dd) => {
      boardOf(dd).balls.push(nb);
    });
    toast(`${sideLabel(kind)}は6球を超えました。非公式の自由配置として追加しています。`, 'warn');
    placedId = nb.id;
  }
  return placedId;
}

function addMatchBallAt(kind: 'jack' | Side, p: Vec): string | null {
  const d = doc();
  const m = d.match!;
  const board = m.board;
  const profile = getProfile(d.profileId);
  if (kind === 'jack') {
    const jack = board.balls.find((b) => b.kind === 'jack')!;
    if (m.phase !== 'jack' && jack.status === 'available') {
      toast('ジャックは「ジャック投球」の段階で配置します。', 'warn');
      return null;
    }
    const pos = round(snapPos(board, jack.id, p, jack.radius));
    apply(m.phase === 'jack' ? 'ジャックを置く（未記録）' : 'ジャックを移動', (dd) => {
      const j = dd.match!.board.balls.find((b) => b.kind === 'jack')!;
      j.x = pos.x;
      j.y = pos.y;
      j.status = 'inPlay';
    });
    return jack.id;
  }
  if (m.phase !== 'color') {
    toast(m.phase === 'jack' ? '先にジャック投球を記録してください。' : 'このエンドの投球は終了しています。', 'warn');
    return null;
  }
  // 仮置き球があれば移動のみ（重複生成しない）
  const pending = m.pendingBallId ? board.balls.find((b) => b.id === m.pendingBallId) : undefined;
  if (pending && pending.side === kind) {
    const pos = round(snapPos(board, pending.id, p, pending.radius));
    apply(`${ballLabel(pending)}の仮置き位置を移動`, (dd) => {
      const b = dd.match!.board.balls.find((x) => x.id === pending.id)!;
      b.x = pos.x;
      b.y = pos.y;
    });
    return pending.id;
  }
  if (M.remainingThrows(m)[kind] <= 0) {
    toast(`${sideLabel(kind)}は投球できる球が残っていません。`, 'warn');
    return null;
  }
  const end = M.currentEndRecord(m);
  const thrown = M.thrownThisEnd(m);
  // 最初のカラー球はジャックを投球した選手、以後は手持ちのある最初のボックス
  const preferBox = thrown.red + thrown.blue === 0 && end.jackBox != null && profile ? end.jackBox : null;
  const cand = (preferBox != null ? M.availableBalls(m, kind, preferBox)[0] : undefined) ?? M.availableBalls(m, kind)[0];
  if (!cand) return null;
  const pos = round(snapPos(board, cand.id, p, cand.radius));
  apply(`${ballLabel(cand)}を仮置き（未記録）`, (dd) => {
    const mm = dd.match!;
    if (mm.pendingBallId && mm.pendingBallId !== cand.id) {
      const prev = mm.board.balls.find((b) => b.id === mm.pendingBallId);
      if (prev) prev.status = 'available';
    }
    const b = mm.board.balls.find((x) => x.id === cand.id)!;
    b.x = pos.x;
    b.y = pos.y;
    b.status = 'inPlay';
    mm.pendingBallId = cand.id;
  });
  return cand.id;
}

/** ドラッグ中の位置更新（履歴は endGesture で1回だけ積む） */
export function dragBall(id: string, p: Vec) {
  useDocStore.getState().updateGesture((dd) => {
    const b = boardOf(dd).balls.find((x) => x.id === id);
    if (b) {
      b.x = p.x;
      b.y = p.y;
    }
  });
}

export function finishDrag(id: string) {
  const st = useDocStore.getState();
  const board = activeBoard(st.doc!);
  const b = board.balls.find((x) => x.id === id);
  if (b) {
    const pos = round(snapPos(board, id, b, b.radius));
    st.updateGesture((dd) => {
      const bb = boardOf(dd).balls.find((x) => x.id === id)!;
      bb.x = pos.x;
      bb.y = pos.y;
    });
  }
  st.endGesture(b ? `${ballLabel(b)}を移動` : '移動');
}

export function setBallPos(id: string, p: Vec) {
  const board = activeBoard(doc());
  const b = board.balls.find((x) => x.id === id);
  if (!b) return;
  const pos = round(p);
  apply(`${ballLabel(b)}の位置を変更`, (dd) => {
    const bb = boardOf(dd).balls.find((x) => x.id === id)!;
    bb.x = pos.x;
    bb.y = pos.y;
    if (bb.status === 'available') bb.status = 'inPlay';
  });
}

export function nudgeBall(id: string, dx: number, dy: number) {
  const b = activeBoard(doc()).balls.find((x) => x.id === id);
  if (b && b.status !== 'available') setBallPos(id, { x: b.x + dx, y: b.y + dy });
}

export function setBallStatus(id: string, status: BallStatus) {
  const b = activeBoard(doc()).balls.find((x) => x.id === id);
  if (!b) return;
  apply(`${ballLabel(b)}の状態を変更`, (dd) => {
    const bb = boardOf(dd).balls.find((x) => x.id === id)!;
    bb.status = status;
    if (dd.match && dd.match.pendingBallId === id && status === 'available') dd.match.pendingBallId = null;
  });
}

export function setBallRadius(id: string, r: number) {
  const b = activeBoard(doc()).balls.find((x) => x.id === id);
  if (!b || !(r > 0.01 && r < 0.2)) return;
  apply(`${ballLabel(b)}の半径を変更`, (dd) => {
    boardOf(dd).balls.find((x) => x.id === id)!.radius = r;
  });
}

/** 球をコートから取り除く（自由配置：手持ちに戻す／非公式球は削除）。確認ダイアログを出す。 */
export async function removeBall(id: string): Promise<void> {
  const d = doc();
  const b = activeBoard(d).balls.find((x) => x.id === id);
  if (!b || b.status === 'available') return;
  const ui = useUI.getState();
  if (d.mode === 'match' && d.match) {
    if (d.match.pendingBallId === id) {
      const ok = await ui.confirm({ title: '仮置きの取り消し', message: `${ballLabel(b)}の仮置きを取り消して手持ちに戻しますか？`, okLabel: '取り消す' });
      if (ok) setBallStatus(id, 'available');
      return;
    }
    if (b.kind === 'jack') {
      toast('試合中のジャックは削除できません。「ジャックをクロスへ再配置」を使ってください。', 'warn');
      return;
    }
    const ok = await ui.confirm({
      title: '球をアウト扱いにする',
      message: `記録済みの${ballLabel(b)}をアウト扱いにします（Undoで戻せます）。`,
      okLabel: 'アウトにする',
      danger: true,
    });
    if (ok) setBallStatus(id, 'out');
    return;
  }
  const ok = await ui.confirm({
    title: '球の削除',
    message: b.unofficial ? `非公式の${ballLabel(b)}を削除しますか？` : `${ballLabel(b)}をコートから取り除き、未配置に戻しますか？`,
    okLabel: '削除',
    danger: true,
  });
  if (!ok) return;
  apply(`${ballLabel(b)}を削除`, (dd) => {
    const board = boardOf(dd);
    if (b.unofficial) board.balls = board.balls.filter((x) => x.id !== id);
    else board.balls.find((x) => x.id === id)!.status = 'available';
  });
  if (ui.selectedId === id) ui.select(null);
}

export async function resetBoard(): Promise<void> {
  const d = doc();
  const ok = await useUI.getState().confirm({
    title: '盤面の初期化',
    message: d.mode === 'match' ? 'このエンドの盤面（記録前の仮置き）を手持ちに戻します。記録済みの投球は変わりません。' : 'すべての球を未配置に戻し、作図（矢印・目標点・注釈）を消去します。',
    okLabel: '初期化',
    danger: true,
  });
  if (!ok) return;
  if (d.mode === 'match') {
    apply('仮置きを取り消し', (dd) => {
      const m = dd.match!;
      if (m.pendingBallId) {
        const b = m.board.balls.find((x) => x.id === m.pendingBallId);
        if (b) b.status = 'available';
        m.pendingBallId = null;
      }
    });
    return;
  }
  apply('盤面を初期化', (dd) => {
    const v = dd.variants.find((x) => x.id === dd.activeVariantId)!;
    v.board = emptyBoard() as Draft<Board>;
  });
  useUI.getState().select(null);
}

export function setTieResolution(r: TieResolution) {
  apply('同距離の手動補正', (dd) => {
    boardOf(dd).tieResolution = r;
  });
}

// ---- 注釈 ----
export function addAnnotation(a: Annotation) {
  apply('作図を追加', (dd) => {
    boardOf(dd).annotations.push(a as Draft<Annotation>);
  });
}

export function updateAnnotation(id: string, patch: Partial<Annotation>, label = '作図を変更') {
  apply(label, (dd) => {
    const a = boardOf(dd).annotations.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}

export function dragAnnotation(id: string, patch: Partial<Annotation>) {
  useDocStore.getState().updateGesture((dd) => {
    const a = boardOf(dd).annotations.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  });
}

export async function removeAnnotation(id: string) {
  const ok = await useUI.getState().confirm({ title: '作図の削除', message: 'この作図を削除しますか？', okLabel: '削除', danger: true });
  if (!ok) return;
  apply('作図を削除', (dd) => {
    const b = boardOf(dd);
    b.annotations = b.annotations.filter((x) => x.id !== id);
  });
  if (useUI.getState().selectedId === id) useUI.getState().select(null);
}

// ---- 局面（バリアント） ----
export function saveVariant(switchTo: boolean, name?: string) {
  const d = doc();
  if (d.mode === 'match' && d.match) {
    branchMatchToSandbox(null);
    return;
  }
  const cur = activeVariant(d);
  const letter = String.fromCharCode(65 + (d.variants.length % 26));
  const v = newVariant(name ?? `${letter}案`, cloneBoard(cur.board), cur.id);
  v.notes = { ...cur.notes };
  apply(switchTo ? `${v.name}に分岐` : `${v.name}として保存`, (dd) => {
    dd.variants.push(v as Draft<typeof v>);
    if (switchTo) dd.activeVariantId = v.id;
  });
  toast(switchTo ? `${v.name}を作成して切り替えました（元の局面は残っています）` : `現在の局面を「${v.name}」として保存しました`);
}

export function switchVariant(id: string) {
  apply('局面を切替', (dd) => {
    dd.activeVariantId = id;
  });
  useUI.getState().select(null);
}

export function renameVariant(id: string, name: string) {
  apply('局面名を変更', (dd) => {
    const v = dd.variants.find((x) => x.id === id);
    if (v) v.name = name;
  });
}

export async function deleteVariant(id: string) {
  const d = doc();
  if (d.variants.length <= 1) {
    toast('最後の局面は削除できません。', 'warn');
    return;
  }
  const v = d.variants.find((x) => x.id === id);
  const ok = await useUI.getState().confirm({ title: '局面の削除', message: `「${v?.name}」を削除しますか？`, okLabel: '削除', danger: true });
  if (!ok) return;
  apply('局面を削除', (dd) => {
    dd.variants = dd.variants.filter((x) => x.id !== id);
    if (dd.activeVariantId === id) dd.activeVariantId = dd.variants[0].id;
  });
}

export function updateNotes(patch: Partial<BoardDoc['variants'][number]['notes']>) {
  apply('戦術メモを変更', (dd) => {
    const v = dd.variants.find((x) => x.id === dd.activeVariantId)!;
    Object.assign(v.notes, patch);
  });
}

export function setHandCount(side: Side, v: number | null) {
  apply('手持ち球数を変更', (dd) => {
    dd.handCounts[side] = v;
  });
}

export function setTitle(title: string) {
  apply('名前を変更', (dd) => {
    dd.title = title;
  });
}

export async function setProfile(id: RuleProfileId): Promise<boolean> {
  const d = doc();
  if (d.profileId === id) return true;
  const p = getProfile(id);
  if (d.mode === 'match' && d.match) {
    const ok = await useUI.getState().confirm({
      title: '規則版の切り替え',
      message: `「${p.shortName}」に切り替えると、次投球の判定、タイブレイクの方式、ペナルティボールの扱いが変わり、保持している試合シナリオの判定が再計算されます。持ち時間とエンド数は変更しません（必要なら試合設定で編集してください）。切り替えますか？`,
      okLabel: '切り替える',
    });
    if (!ok) return false;
  }
  apply('規則版を変更', (dd) => {
    dd.profileId = id;
  });
  toast(`規則版：${p.shortName}`);
  return true;
}

export function setCourt(patch: Partial<BoardDoc['court']>) {
  apply('コート設定を変更', (dd) => {
    Object.assign(dd.court, patch);
  });
}

// ---- 文書 ----
export function newSandboxDoc(): BoardDoc {
  const d = createSandboxDoc(doc()?.profileId ?? 'standard-2021-2024-v2');
  useDocStore.getState().load(d);
  useUI.getState().select(null);
  return d;
}

/** 試合の任意の時点の盤面から、自由配置の新しい文書へ分岐（元の試合は消さない） */
export function branchMatchToSandbox(seq: number | null): BoardDoc {
  const d = doc();
  const m = d.match!;
  const ev = seq != null ? m.throws.find((t) => t.seq === seq) : undefined;
  const balls: Ball[] = JSON.parse(JSON.stringify(ev ? ev.boardAfter : m.board.balls));
  const nd = createSandboxDoc(d.profileId, `${d.title}（分岐${ev ? `：#${ev.seq}` : ''}）`);
  nd.court = JSON.parse(JSON.stringify(d.court));
  nd.variants[0].board = { balls, annotations: JSON.parse(JSON.stringify(m.board.annotations)), tieResolution: 'auto' };
  nd.branchedFrom = { docId: d.id, throwSeq: ev?.seq, title: d.title };
  nd.matchType = m.setup.matchType;
  useDocStore.getState().load(nd);
  toast('この局面を自由配置の新しい盤面として分岐しました。元の試合はそのまま保存されています。');
  return nd;
}

// ---- 試合再現 ----
export function startMatch(profileId: RuleProfileId, setup: M.MatchSetup, title: string) {
  const p = getProfile(profileId);
  const nd = createSandboxDoc(profileId, title);
  nd.mode = 'match';
  nd.matchType = setup.matchType;
  nd.match = M.createMatch(p, setup);
  nd.court = JSON.parse(JSON.stringify(doc()?.court ?? nd.court));
  useDocStore.getState().load(nd);
  useUI.getState().setTab('match');
}

export function matchApply(label: string, fn: (m: M.MatchState) => M.MatchState) {
  const d = doc();
  if (!d.match) return;
  const next = fn(d.match);
  if (next === d.match) return;
  useDocStore.getState().replace(label, { ...d, match: next, updatedAt: nowIso() });
}

export function updateMatchSetup(patch: Partial<M.MatchSetup>) {
  apply('試合設定を変更', (dd) => {
    if (dd.match) Object.assign(dd.match.setup, patch);
  });
}
