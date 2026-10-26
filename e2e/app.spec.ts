import { test, expect, type Page } from '@playwright/test';

/** コートのワールド座標(m) → 画面座標(px)。CourtView と同じ変換式（ズーム状態は data 属性から取得） */
async function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector('[data-testid="court"] svg') as SVGSVGElement;
      const r = svg.getBoundingClientRect();
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const s0 = Math.min(r.width / vw, r.height / vh);
      const ox = (r.width - vw * s0) / 2;
      const oy = (r.height - vh * s0) / 2;
      const g = svg.querySelector('g')!.getAttribute('transform')!;
      const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(g)!;
      const tx = Number(m[1]);
      const ty = Number(m[2]);
      const k = Number(m[3]);
      return { x: r.left + ox + (tx + k * x - vx) * s0, y: r.top + oy + (ty + k * y - vy) * s0 };
    },
    [x, y] as const,
  );
}

/** タッチのポインターイベントを合成（1本指ドラッグ／2本指ピンチ用） */
async function touchPointer(page: Page, type: string, id: number, x: number, y: number) {
  await page.evaluate(
    ([type, id, x, y]) => {
      const svg = document.querySelector('[data-testid="court"] svg')!;
      svg.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: 'touch', clientX: x as number, clientY: y as number, bubbles: true, isPrimary: id === 1, button: 0 }));
    },
    [type, id, x, y] as const,
  );
}

async function tapAt(page: Page, x: number, y: number) {
  const p = await toScreen(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}

async function dragTouch(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from);
  const b = await toScreen(page, ...to);
  await touchPointer(page, 'pointerdown', 1, a.x, a.y);
  for (let i = 1; i <= 8; i++) await touchPointer(page, 'pointermove', 1, a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await touchPointer(page, 'pointerup', 1, b.x, b.y);
}

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('boccia-strategy-board');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload();
  await expect(page.getByTestId('court')).toBeVisible();
}

async function score(page: Page) {
  const r = await page.getByTestId('score-red').first().innerText();
  const b = await page.getByTestId('score-blue').first().innerText();
  return `${r.replace(/\s/g, '')}/${b.replace(/\s/g, '')}`;
}

test('自由配置：タップで追加、ドラッグ移動、暫定得点、Undo/Redo、数値編集', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('tab-info').click();
  await page.getByTestId('tool-jack').tap();
  await tapAt(page, 3, 5);
  await page.getByTestId('tool-red').tap();
  await tapAt(page, 3.3, 5);
  await page.getByTestId('tool-blue').tap();
  await tapAt(page, 3, 5.6);
  // 赤が近い → 赤1–青0
  await expect.poll(() => score(page)).toBe('赤1/青0');

  // 赤をジャックから遠くへドラッグ → 青1–赤0
  await page.getByTestId('tool-select').tap();
  // ドラッグはタップ位置（丸め後の座標）から
  await dragTouch(page, [3.3, 5], [3.0, 4.0]);
  await expect.poll(() => score(page)).toBe('赤0/青1');

  // Undo で戻る、Redo で再適用
  await page.getByTestId('undo').tap();
  await expect.poll(() => score(page)).toBe('赤1/青0');
  await page.getByTestId('redo').tap();
  await expect.poll(() => score(page)).toBe('赤0/青1');

  // 数値編集：ジャックを (300, 500)cm、赤1を (300, 480)cm に
  await page.getByTestId('tab-balls').click();
  await page.getByTestId('ball-item-jack').tap();
  await page.getByTestId('ball-x').fill('300');
  await page.getByTestId('ball-x').press('Enter');
  await page.getByTestId('ball-y').fill('500');
  await page.getByTestId('ball-y').press('Enter');
  await page.getByTestId('ball-item-red-1').tap();
  await page.getByTestId('ball-x').fill('300');
  await page.getByTestId('ball-x').press('Enter');
  await page.getByTestId('ball-y').fill('480');
  await page.getByTestId('ball-y').press('Enter');
  await page.getByTestId('tab-info').click();
  // 赤 20.0cm → 赤1
  await expect.poll(() => score(page)).toBe('赤1/青0');
  await expect(page.getByTestId('score-breakdown')).toContainText('20.0cm');
});

test('ピンチズームしても実座標・距離が変わらない／リロード後も復元', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('tool-jack').tap();
  await tapAt(page, 3, 5);
  await page.getByTestId('tool-red').tap();
  await tapAt(page, 3.5, 5);
  await page.getByTestId('tab-info').click();
  const before = (await page.getByTestId('score-breakdown').textContent())!;

  const c = await toScreen(page, 3, 5);
  await touchPointer(page, 'pointerdown', 1, c.x - 30, c.y);
  await touchPointer(page, 'pointerdown', 2, c.x + 30, c.y);
  for (let i = 1; i <= 6; i++) {
    await touchPointer(page, 'pointermove', 1, c.x - 30 - i * 20, c.y);
    await touchPointer(page, 'pointermove', 2, c.x + 30 + i * 20, c.y);
  }
  await touchPointer(page, 'pointerup', 1, c.x - 150, c.y);
  await touchPointer(page, 'pointerup', 2, c.x + 150, c.y);
  const zoomText = await page.locator('[data-testid="court"]').innerText();
  expect(zoomText).not.toContain('×1.0');
  expect(await page.getByTestId('score-breakdown').textContent()).toBe(before);

  // ページ全体はスクロールしていない
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.waitForTimeout(800); // 自動保存
  await page.reload();
  await page.getByTestId('tab-info').click();
  await expect.poll(() => page.getByTestId('score-breakdown').textContent()).toBe(before);
});

test('局面の分岐とA/B比較、作図（目標点・矢印）', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('tool-jack').tap();
  await tapAt(page, 3, 5);
  await page.getByTestId('tool-red').tap();
  await tapAt(page, 3.4, 5);
  await page.getByTestId('tool-target').tap();
  await tapAt(page, 3.1, 5.2);
  await page.getByTestId('tool-arrow').tap();
  await tapAt(page, 2.5, 11.2); // ボックス3 → 中心にスナップ
  await tapAt(page, 3.1, 5.2);
  await page.getByTestId('tab-tactics').click();
  await expect(page.getByText('➜ コース1')).toBeVisible();
  await expect(page.getByText('◎ 目標1')).toBeVisible();

  await page.getByTestId('tab-variants').click();
  await page.getByTestId('branch').tap();
  await page.getByTestId('tool-select').tap();
  await dragTouch(page, [3.4, 5], [3.05, 5.1]);
  await page.getByTestId('compare-open').tap();
  await expect(page.getByTestId('compare-dialog')).toBeVisible();
  await expect(page.getByTestId('compare-dialog')).toContainText('ジャックの移動距離');
});

test('JSON・PNG・SVG の書き出し', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit のダウンロードイベントは環境依存のため Chromium で確認');
  await freshStart(page);
  await page.getByTestId('tool-jack').tap();
  await tapAt(page, 3, 5);
  await page.getByTestId('open-export').click();
  for (const id of ['export-json', 'export-svg', 'export-png']) {
    const dl = page.waitForEvent('download');
    await page.getByTestId(id).click();
    const d = await dl;
    expect(d.suggestedFilename()).toMatch(/\.(json|svg|png)$/);
  }
});

test('試合再現：通常版 個人戦の1エンド進行（ドラッグでは球数が減らない）', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('mode-match').click();
  await page.getByTestId('match-start').click();
  await expect(page.getByTestId('jack-phase')).toContainText('赤 3番ボックス');
  await page.getByTestId('tool-jack').tap();
  await tapAt(page, 3, 5);
  await page.getByTestId('jack-valid').click();
  await expect(page.getByTestId('match-next')).toContainText('次は赤');

  // 赤を仮置き → 残り球は減らない
  await page.getByTestId('tool-red').tap();
  await tapAt(page, 3.2, 5);
  await expect(page.getByTestId('color-phase')).toContainText('赤 残り6球');
  await page.getByTestId('record-throw').click();
  await page.getByTestId('record-submit').click();
  await expect(page.getByTestId('color-phase')).toContainText('赤 残り5球');
  await expect(page.getByTestId('match-next')).toContainText('次は青');

  // 青が近くに → 次は赤
  await page.getByTestId('tool-blue').tap();
  await tapAt(page, 3, 5.12);
  await page.getByTestId('bottom-record').click();
  await page.getByTestId('record-submit').click();
  await expect(page.getByTestId('match-next')).toContainText('次は赤');

  // 両サイド BNP でエンド終了 → 採点 → 確定
  for (const side of ['赤', '青']) {
    await page.getByRole('button', { name: `${side} BNP申告` }).click();
    await page.getByTestId('confirm-ok').click();
  }
  await expect(page.getByTestId('scoring-phase')).toBeVisible();
  await page.getByTestId('confirm-end').click();
  await expect(page.getByTestId('score-table')).toContainText('第1エンド');
  await expect(page.getByTestId('total-blue')).toHaveText('1');
  await expect(page.getByTestId('jack-phase')).toContainText('青 4番ボックス');
});

test('規則版の切替：フレンドリー版はファイナルショット', async ({ page }) => {
  await freshStart(page);
  await page.getByTestId('mode-match').click();
  await page.getByTestId('setup-profile').selectOption('friendly-v2');
  await expect(page.getByTestId('match-setup')).toContainText('ファイナルショット');
  await expect(page.getByTestId('match-setup')).toContainText('初期提案');
  await page.getByTestId('match-start').click();
  await expect(page.getByTestId('tab-match')).toBeVisible();
  await expect(page.getByTestId('clock-red')).toHaveText('4:00');
});
