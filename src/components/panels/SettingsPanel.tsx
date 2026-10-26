// 表示設定とコート寸法設定
import { useDoc, useProfile } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import { Btn, NumField, Note, Section, TextField, Toggle } from '../ui';
import { DEFAULT_COURT } from '../../domain/geometry';
import { PROFILE_IDS, getProfile } from '../../domain/rules/registry';
import type { CourtConfig, Vec } from '../../domain/types';

export function SettingsPanel() {
  const doc = useDoc();
  const profile = useProfile();
  const display = useUI((s) => s.display);
  const setDisplay = useUI((s) => s.setDisplay);
  const dark = useUI((s) => s.dark);
  const setDark = useUI((s) => s.setDark);
  const c = doc.court;

  const setVec = (key: keyof CourtConfig, axis: 'x' | 'y', cm: number) => {
    const cur = c[key] as Vec;
    A.setCourt({ [key]: { ...cur, [axis]: cm / 100 }, custom: true } as Partial<CourtConfig>);
  };
  const setNum = (key: keyof CourtConfig, cm: number) => A.setCourt({ [key]: cm / 100, custom: true } as Partial<CourtConfig>);

  return (
    <div>
      <Section title="規則版">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="規則版">
          {PROFILE_IDS.map((id) => (
            <Btn key={id} active={doc.profileId === id} variant={doc.profileId === id ? 'primary' : 'default'} onClick={() => void A.setProfile(id)} testId={`settings-profile-${id}`}>
              {getProfile(id).shortName}
            </Btn>
          ))}
        </div>
        <Note>{profile.name}</Note>
      </Section>
      <Section title="表示">
        <Toggle label="球の番号ラベル" checked={display.showNumbers} onChange={(v) => setDisplay({ showNumbers: v })} />
        <Toggle label="ジャックからの測定線・距離ラベル" checked={display.showDistances} onChange={(v) => setDisplay({ showDistances: v })} />
        <Toggle label="0.5mグリッド" checked={display.showGrid} onChange={(v) => setDisplay({ showGrid: v })} />
        <Toggle label="縮小時の位置補助リング（実寸ではない）" checked={display.showHalo} onChange={(v) => setDisplay({ showHalo: v })} />
        <Toggle label="ジャック無効エリアの色分け" checked={display.showInvalidArea} onChange={(v) => setDisplay({ showInvalidArea: v })} />
        <Toggle label="矢印の接触候補を表示" checked={display.showContacts} onChange={(v) => setDisplay({ showContacts: v })} />
        <Toggle
          label={`35cmターゲットボックス（${profile.showTargetBox ? '通常版のペナルティ説明用' : 'フレンドリー版では自動適用しません'}）`}
          checked={display.showTargetBox ?? profile.showTargetBox}
          onChange={(v) => setDisplay({ showTargetBox: v })}
        />
        <Toggle label="重なり回避（接触位置へスナップ）" checked={display.snap} onChange={(v) => setDisplay({ snap: v })} testId="snap-toggle" />
        <label className="flex min-h-[40px] items-center justify-between gap-3 text-sm">
          <span>球の不透明度</span>
          <input type="range" min={0.2} max={1} step={0.05} value={display.ballOpacity} onChange={(e) => setDisplay({ ballOpacity: Number(e.target.value) })} className="w-40" />
        </label>
        <Toggle label="ダークモード" checked={dark} onChange={setDark} />
      </Section>

      <Section title="コート寸法" right={c.custom ? <span className="rounded bg-amber-400 px-1.5 text-xs font-bold text-black">変更あり</span> : undefined}>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="横" unit="cm" value={Math.round(c.width * 1000) / 10} onCommit={(v) => setNum('width', v)} min={100} max={1000} width="w-20" />
          <NumField label="縦（全体）" unit="cm" value={Math.round(c.length * 1000) / 10} onCommit={(v) => setNum('length', v)} min={200} max={1500} width="w-20" />
          <NumField label="プレイングエリア" unit="cm" value={Math.round(c.playingLength * 1000) / 10} onCommit={(v) => setNum('playingLength', v)} min={100} max={1400} width="w-20" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          {(
            [
              ['cross', 'クロス'],
              ['vLeft', 'V左端'],
              ['vApex', 'V頂点'],
              ['vRight', 'V右端'],
            ] as const
          ).map(([k, l]) => (
            <div key={k} className="rounded border border-slate-200 p-1.5 dark:border-slate-700">
              <div className="mb-1 font-semibold">{l}</div>
              <NumField label="x" unit="cm" width="w-20" value={Math.round((c[k] as Vec).x * 1000) / 10} onCommit={(v) => setVec(k, 'x', v)} />
              <NumField label="y" unit="cm" width="w-20" value={Math.round((c[k] as Vec).y * 1000) / 10} onCommit={(v) => setVec(k, 'y', v)} />
            </div>
          ))}
        </div>
        {c.custom && (
          <>
            <TextField label="大会申し合わせによる変更（注記）" value={c.customNote} onCommit={(customNote) => A.setCourt({ customNote })} placeholder="例：〇〇大会申し合わせによりコート縦11m" />
            <Btn
              small
              className="mt-2"
              onClick={() => A.setCourt({ ...DEFAULT_COURT, cross: { ...DEFAULT_COURT.cross }, vLeft: { ...DEFAULT_COURT.vLeft }, vApex: { ...DEFAULT_COURT.vApex }, vRight: { ...DEFAULT_COURT.vRight } })}
            >
              標準寸法に戻す
            </Btn>
          </>
        )}
        <Note>
          標準寸法：6.00m×12.50m、プレイングエリア10.00m、クロス(3.00, 5.00)、V頂点(3.00, 8.50)。寸法を変更しても、Vライン・クロスの座標は比率で自動拡大しません。個別に編集してください。フレンドリーマッチでは大会申し合わせでコート寸法が調整される場合があります（{profile.refs.court}）。
        </Note>
      </Section>
    </div>
  );
}
