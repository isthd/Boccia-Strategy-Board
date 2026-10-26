// 書き出し・読み込み（PNG/SVG/JSON）
import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Btn, Note, Toggle } from '../ui';
import { useBoard, useDoc, useProfile } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import { useDocStore } from '../../store/docStore';
import { buildSvg, safeFileName, shareOrDownload, svgToPngBlob, type ExportOptions } from '../court/exportBoard';
import { parseImport, toExportJson } from '../../persistence/schema';
import { activeVariant } from '../../domain/document';
import { flushNow } from '../../store/persistence';

export function ExportDialog() {
  const doc = useDoc();
  const { board } = useBoard();
  const profile = useProfile();
  const ui = useUI();
  const close = () => ui.openDialog(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const variantName = doc.mode === 'sandbox' ? activeVariant(doc).name : '';
  const [o, setO] = useState<ExportOptions>({
    title: doc.title + (variantName ? ` ／ ${variantName}` : ''),
    showNumbers: true,
    showDimensions: true,
    showAnnotations: true,
    showTitle: true,
    showScore: true,
    showDistances: true,
    showTargetBox: ui.display.showTargetBox ?? profile.showTargetBox,
    subtitle: `${profile.shortName}${doc.court.custom ? ' ／ コート寸法：大会申し合わせによる変更' : ''}`,
  });
  const [busy, setBusy] = useState(false);
  const base = safeFileName(o.title);

  const exportSvg = async () => {
    const { svg } = buildSvg(doc.court, board, o);
    const r = await shareOrDownload(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`);
    ui.toast(r === 'shared' ? 'SVGを共有しました' : 'SVGを書き出しました');
  };
  const exportPng = async () => {
    setBusy(true);
    try {
      const { svg, width, height } = buildSvg(doc.court, board, o);
      const png = await svgToPngBlob(svg, width, height);
      const r = await shareOrDownload(png, `${base}.png`);
      ui.toast(r === 'shared' ? 'PNGを共有しました' : 'PNGを書き出しました');
    } catch (e) {
      ui.toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const exportJson = async () => {
    const r = await shareOrDownload(new Blob([toExportJson(doc)], { type: 'application/json' }), `${base}.boccia.json`);
    ui.toast(r === 'shared' ? 'JSONを共有しました' : 'JSONを書き出しました');
  };
  const importJson = async (f: File) => {
    const text = await f.text();
    const r = parseImport(text, { newIdOnImport: true });
    if (!r.ok) {
      await ui.confirm({ title: '読み込みエラー', message: r.errors.join('\n'), okLabel: '閉じる' });
      return;
    }
    await flushNow();
    useDocStore.getState().load(r.doc);
    ui.toast(`「${r.doc.title}」を読み込みました${r.notes.length ? `（${r.notes.join(' ')}）` : ''}`);
    close();
  };

  const opt = (k: keyof ExportOptions, label: string) => <Toggle label={label} checked={o[k] as boolean} onChange={(v) => setO({ ...o, [k]: v })} />;

  return (
    <Modal title="書き出し・読み込み" onClose={close} testId="export-dialog">
      <div className="space-y-3">
        <section>
          <h3 className="mb-1 text-sm font-bold">盤面画像（PNG／SVG）</h3>
          {opt('showTitle', 'タイトル')}
          {opt('showScore', '暫定得点')}
          {opt('showNumbers', '球番号')}
          {opt('showDimensions', '寸法')}
          {opt('showAnnotations', '矢印・目標点・注釈')}
          {opt('showDistances', 'ジャックからの距離線')}
          {opt('showTargetBox', '35cmターゲットボックス')}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Btn onClick={exportPng} disabled={busy} testId="export-png">PNGで書き出し</Btn>
            <Btn onClick={exportSvg} testId="export-svg">SVGで書き出し</Btn>
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-sm font-bold">データ（JSON）</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            名前、日時、規則プロファイル、試合種別、配置、球ごとの状態、注釈、投球履歴、得点と手動補正、版番号を含みます。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Btn onClick={exportJson} testId="export-json">JSONで書き出し</Btn>
            <Btn onClick={() => fileRef.current?.click()} testId="import-json">JSONを読み込む</Btn>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
          <Note>読み込み時に、形式・座標範囲・ID重複・版番号を検証します。読み込んだデータは新しい盤面として追加され、既存の盤面は上書きしません。</Note>
        </section>
        <Note>データは端末内（IndexedDB）にのみ保存され、外部へ送信しません。共有は端末の共有機能で利用者が明示的に行う場合のみです。</Note>
      </div>
    </Modal>
  );
}
