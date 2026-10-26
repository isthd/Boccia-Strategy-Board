import { describe, expect, it } from 'vitest';
import { parseImport, toExportJson } from '../persistence/schema';
import { createSandboxDoc } from '../domain/document';
import { createMatch, defaultSetup } from '../domain/match';
import { standardV2 } from '../domain/rules/standard-v2';

describe('JSON入出力', () => {
  it('エクスポートしたデータを読み込める（往復で座標が変わらない）', () => {
    const d = createSandboxDoc();
    d.variants[0].board.balls[1] = { ...d.variants[0].board.balls[1], x: 3.123456, y: 4.987654, status: 'inPlay' };
    const r = parseImport(toExportJson(d));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.variants[0].board.balls[1]).toMatchObject({ x: 3.123456, y: 4.987654 });
  });
  it('試合データも往復できる', () => {
    const d = createSandboxDoc();
    d.mode = 'match';
    d.match = createMatch(standardV2, defaultSetup(standardV2, 'team'));
    expect(parseImport(toExportJson(d)).ok).toBe(true);
  });
  it('不正なJSON', () => {
    expect(parseImport('{abc').ok).toBe(false);
  });
  it('座標範囲外', () => {
    const d = createSandboxDoc();
    d.variants[0].board.balls[0].x = 999;
    const r = parseImport(JSON.stringify(d));
    expect(r.ok).toBe(false);
  });
  it('球ID重複', () => {
    const d = createSandboxDoc();
    d.variants[0].board.balls[2].id = d.variants[0].board.balls[1].id;
    const r = parseImport(JSON.stringify(d));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('重複');
  });
  it('新しい版のデータは拒否', () => {
    const d = createSandboxDoc();
    d.schemaVersion = 99;
    expect(parseImport(JSON.stringify(d)).ok).toBe(false);
  });
  it('版番号のない旧データは版1として移行', () => {
    const d = createSandboxDoc() as unknown as Record<string, unknown>;
    delete d.schemaVersion;
    const r = parseImport(JSON.stringify(d));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.notes.length).toBe(1);
  });
});
