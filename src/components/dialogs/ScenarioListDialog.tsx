// 保存済み盤面の一覧：開く・複製・名前変更・削除・検索
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Btn, Note } from '../ui';
import { useUI } from '../../store/uiStore';
import { useDocStore } from '../../store/docStore';
import { deleteDoc, getDoc, listDocs, putDoc, type DocSummary } from '../../persistence/db';
import { flushNow, storageAvailable } from '../../store/persistence';
import { getProfile } from '../../domain/rules/registry';
import { createSandboxDoc, newId, nowIso } from '../../domain/document';

export function ScenarioListDialog() {
  const ui = useUI();
  const close = () => ui.openDialog(null);
  const current = useDocStore((s) => s.doc);
  const [list, setList] = useState<DocSummary[]>([]);
  const [q, setQ] = useState('');

  const refresh = async () => {
    await flushNow();
    setList(await listDocs());
  };
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (id: string) => {
    await flushNow();
    const d = await getDoc(id);
    if (d) {
      useDocStore.getState().load(d);
      ui.select(null);
      ui.setPreviewSeq(null);
      ui.setTab(d.mode === 'match' ? 'match' : 'info');
      close();
    }
  };
  const duplicate = async (id: string) => {
    const d = await getDoc(id);
    if (!d) return;
    const copy = { ...JSON.parse(JSON.stringify(d)), id: newId('doc'), title: `${d.title}（コピー）`, createdAt: nowIso(), updatedAt: nowIso() };
    await putDoc(copy);
    await refresh();
  };
  const rename = async (id: string, title: string) => {
    const n = await ui.prompt({ title: '名前の変更', label: '名前', initial: title });
    if (!n) return;
    if (current?.id === id) useDocStore.getState().apply('名前を変更', (d) => void (d.title = n));
    else {
      const d = await getDoc(id);
      if (d) await putDoc({ ...d, title: n, updatedAt: nowIso() });
    }
    await refresh();
  };
  const remove = async (id: string, title: string) => {
    const ok = await ui.confirm({ title: '盤面の削除', message: `「${title}」を端末から削除します。元に戻せません。`, okLabel: '削除', danger: true });
    if (!ok) return;
    await deleteDoc(id);
    if (current?.id === id) useDocStore.getState().load(createSandboxDoc());
    await refresh();
  };
  const createNew = async () => {
    await flushNow();
    useDocStore.getState().load(createSandboxDoc(current?.profileId));
    ui.select(null);
    ui.setTab('info');
    close();
  };

  const filtered = list.filter((d) => !q || d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal title="保存済みの盤面" onClose={close} wide testId="scenario-list">
      <div className="mb-2 flex gap-2">
        <input
          className="min-h-[44px] flex-1 rounded-md border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
          placeholder="名前で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="名前で検索"
        />
        <Btn variant="primary" onClick={createNew} testId="new-board">新しい盤面</Btn>
      </div>
      {!storageAvailable && <Note kind="danger">この環境では端末内保存が使えません。JSON書き出しでデータを保存してください。</Note>}
      <div className="flex flex-col gap-1.5">
        {filtered.map((d) => (
          <div key={d.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${current?.id === d.id ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-700'}`}>
            <button className="min-h-[44px] min-w-[180px] flex-1 text-left" onClick={() => void open(d.id)}>
              <div className="font-semibold">
                {d.title} {current?.id === d.id && <span className="text-xs text-emerald-600">（表示中）</span>}
              </div>
              <div className="text-xs text-slate-500">
                {d.mode === 'match' ? '試合再現' : `自由配置・局面${d.variantCount}`} ／ {getProfile(d.profileId).shortName} ／ 更新 {new Date(d.updatedAt).toLocaleString('ja-JP')}
              </div>
            </button>
            <Btn small variant="ghost" onClick={() => void duplicate(d.id)}>複製</Btn>
            <Btn small variant="ghost" onClick={() => void rename(d.id, d.title)}>名前</Btn>
            <Btn small variant="ghost" onClick={() => void remove(d.id, d.title)}>削除</Btn>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500">保存済みの盤面はありません。</p>}
      </div>
      <Note>盤面は操作のたびに端末内へ自動保存されます。</Note>
    </Modal>
  );
}
