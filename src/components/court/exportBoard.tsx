// 盤面のSVG/PNG書き出し
import { renderToStaticMarkup } from 'react-dom/server';
import { CourtContent } from './CourtContent';
import type { Board, CourtConfig } from '../../domain/types';
import { computeScore } from '../../domain/scoring';

export interface ExportOptions {
  title: string;
  showNumbers: boolean;
  showDimensions: boolean;
  showAnnotations: boolean;
  showTitle: boolean;
  showScore: boolean;
  showDistances: boolean;
  showTargetBox: boolean;
  subtitle: string;
}

const PX_PER_M = 110;

export function buildSvg(court: CourtConfig, board: Board, o: ExportOptions): { svg: string; width: number; height: number } {
  const score = computeScore(board.balls, court, board.tieResolution);
  const margin = o.showDimensions ? 0.8 : 0.4;
  const header = o.showTitle || o.showScore ? 1.1 : 0;
  const vbX = -margin;
  const vbY = -margin - header;
  const vbW = court.width + margin * 2;
  const vbH = court.length + margin * 2 + header;
  const width = Math.round(vbW * PX_PER_M);
  const height = Math.round(vbH * PX_PER_M);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const inner = renderToStaticMarkup(
    <CourtContent
      court={court}
      board={board}
      pxPerM={PX_PER_M}
      showTargetBox={o.showTargetBox}
      showNumbers={o.showNumbers}
      showGrid={false}
      ballOpacity={1}
      showDistances={o.showDistances}
      showHalo={false}
      showContacts={o.showAnnotations}
      showInvalidArea
      showAnnotations={o.showAnnotations}
      showDimensions={o.showDimensions}
      score={score}
    />,
  );
  const top = -margin - header;
  const headerSvg =
    header > 0
      ? `<rect x="${vbX}" y="${top}" width="${vbW}" height="${header}" fill="#0f172a"/>` +
        (o.showTitle ? `<text x="${vbX + 0.2}" y="${top + 0.45}" font-size="0.32" font-weight="700" fill="#fff">${esc(o.title)}</text>` : '') +
        (o.subtitle ? `<text x="${vbX + 0.2}" y="${top + 0.85}" font-size="0.2" fill="#cbd5e1">${esc(o.subtitle)}</text>` : '') +
        (o.showScore
          ? `<text x="${vbX + vbW - 0.2}" y="${top + 0.62}" font-size="0.42" font-weight="800" text-anchor="end"><tspan fill="#f87171">赤 ${score.red}</tspan><tspan fill="#94a3b8"> – </tspan><tspan fill="#60a5fa">青 ${score.blue}</tspan></text>` +
            `<text x="${vbX + vbW - 0.2}" y="${top + 0.92}" font-size="0.15" fill="#cbd5e1" text-anchor="end">暫定得点（このまま終了した場合）</text>`
          : '')
      : '';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" font-family="'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif">
<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#334155"/>
${headerSvg}
${inner}
<text x="${vbX + vbW - 0.1}" y="${vbY + vbH - 0.08}" font-size="0.12" fill="#cbd5e1" text-anchor="end">Boccia Strategy Board ／ 座標・距離はモデル値（実寸m）</text>
</svg>`;
  return { svg, width, height };
}

export async function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('SVGの画像化に失敗しました'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG変換に失敗しました'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** iPad等で共有シートが使えれば共有、なければダウンロード */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'boccia';
