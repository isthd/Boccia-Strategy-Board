// 自動保存と起動時の復旧
import { useDocStore } from './docStore';
import { useUI } from './uiStore';
import { getDoc, getMeta, putDoc, setMeta } from '../persistence/db';
import { createSandboxDoc, type BoardDoc } from '../domain/document';
import { docSchema } from '../persistence/schema';

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: BoardDoc | null = null;
export let storageAvailable = true;

async function flush() {
  const d = useDocStore.getState().doc;
  if (!d || d === lastSaved || useDocStore.getState().gestureBase) return;
  try {
    await putDoc(d);
    await setMeta('lastDocId', d.id);
    lastSaved = d;
  } catch (e) {
    if (storageAvailable) {
      storageAvailable = false;
      useUI.getState().toast('端末内への保存に失敗しました（プライベートブラウズ等）。JSONエクスポートで保存してください。', 'error');
    }
    console.error(e);
  }
}

export function flushNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  return flush();
}

export async function initPersistence(): Promise<void> {
  let doc: BoardDoc | undefined;
  try {
    const id = await getMeta<string>('lastDocId');
    if (id) {
      const raw = await getDoc(id);
      if (raw && docSchema.safeParse(raw).success) doc = raw;
      else if (raw) useUI.getState().toast('前回の盤面データを読み込めませんでした。新しい盤面を開きます。', 'warn');
    }
  } catch (e) {
    storageAvailable = false;
    console.error(e);
  }
  const d = doc ?? createSandboxDoc();
  useDocStore.getState().load(d);
  lastSaved = doc ?? null;

  useDocStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc && !s.gestureBase) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    }
  });
  const onHide = () => void flushNow();
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
}
