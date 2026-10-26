// ヘルプ：使い方、規則の出典、規則版の違い、限界
import { Modal } from './Modal';
import { useUI } from '../../store/uiStore';
import { standardV2 } from '../../domain/rules/standard-v2';
import { friendlyV2 } from '../../domain/rules/friendly-v2';
import type { RuleProfile } from '../../domain/rules/profile';

const ROWS: Array<[string, (p: RuleProfile) => string]> = [
  ['持ち時間', (p) => p.classes.individual.map((c) => `${c.label} ${c.timeSec / 60}分`).join('、') + ' ／ ' + [...p.classes.pair, ...p.classes.team].map((c) => `${c.label} ${c.timeSec / 60}分`).join('、')],
  ['エンド数', (p) => `個人${p.matchTypes.individual.defaultEnds}・ペア${p.matchTypes.pair.defaultEnds}・チーム${p.matchTypes.team.defaultEnds}${p.matchTypes.team.endsProvisional ? '（通常版からの初期提案／大会要確認）' : ''}`],
  ['等距離・得点球数が異なる', (p) => (p.unequalTieRule === 'fewerScoringBalls' ? '得点球の少ない側が投球' : '本文に明示なし → 主催者・審判判断')],
  ['最終エンドのジャックファウル', (p) => (p.finalEndJackFoul === 'firstEndThrower' ? '第1エンドの担当が投球' : '本文に明示なし → 手動判断')],
  ['クロスが塞がっている場合のジャック', (p) => (p.occupiedCrossRule === 'frontOfCross' ? 'クロス前面の中央・できるだけ近く' : '本文に明示なし → 手動で位置確定')],
  ['タイブレイク', (p) => `${p.tieBreak.label}（${p.tieBreak.ruleRef}）`],
  ['ペナルティボール', (p) => (p.penaltyBalls ? 'あり（手動で付与・結果確定）' : '加点フローなし（反則はボール除去）')],
];

export function HelpDialog() {
  const close = () => useUI.getState().openDialog(null);
  return (
    <Modal title="ヘルプ・規則の出典" onClose={close} wide testId="help-dialog">
      <div className="space-y-4 text-sm leading-relaxed">
        <section>
          <h3 className="mb-1 font-bold">基本操作</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>ツールで「白（ジャック）」「赤」「青」を選び、コートをタップすると1球追加。既存の球は指でドラッグして移動。</li>
            <li>2本指でピンチズーム・パン、球のない場所を1本指でドラッグしてパン。右下のボタンで拡大・縮小・ジャック周辺・全体表示。</li>
            <li>球を選ぶと「球」タブで座標を数値入力、1cm／5cm単位の移動、状態（アウト等）の変更ができます。タッチしにくい球は一覧から選択。</li>
            <li>「作戦」タブ：目標点、矢印（始点をボックス内でタップ→ボックス中心にスナップ）、注釈。矢印の直線経路上の接触候補を表示。</li>
            <li>「局面」タブ：分岐（A案→B案）、局面の保存、A/B比較。</li>
            <li>「試合」タブ：試合再現。ジャック投球 → カラー球 → 次サイド → エンド採点 → 次エンド。ドラッグだけでは記録されず、「この状態を1投として記録」で確定。</li>
            <li>キーボード：Ctrl+Z 元に戻す／Ctrl+Shift+Z または Ctrl+Y やり直す／Delete 選択球の削除／矢印キー 1cm移動（Shift で5cm）／V 選択 J ジャック R 赤 B 青 M 計測 A 矢印 T 目標点／Esc 選択解除。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-bold">座標と計算</h3>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>原点はコート上端左隅（投球エリアの反対側）、右が+x、下が+y。すべてメートル単位の実座標で保持し、ズームや端末の大きさで値は変わりません。</li>
            <li>コート：6.00m×12.50m、プレイングエリア10.00m、スローイングボックス1m×2.5m×6、クロス(3.00, 5.00)、Vライン(0,7.00)→(3.00,8.50)→(6.00,7.00)。外枠・スローイングライン・Vラインの判定は有効側（内側）の縁を基準とし、線幅は描画のみに使います。</li>
            <li>球は公称円周270mmから算出した半径約4.30cmの円で近似。距離順位は表面間の推定距離（＝中心間距離−両半径）で決め、同半径なら中心間距離の順位と一致します。</li>
            <li>外周ラインに接触・越えた球はアウト相当として得点から除外し、警告します。ジャックはVラインを完全に越えていなければ無効エリアと判定します。</li>
            <li>赤青最寄り球の差が1mm未満は「近接・要計測」と警告し、公式の同距離とは断定しません。手動補正（同距離／赤優勢／青優勢）で審判判断を反映できます。</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-bold">規則版の違い（このアプリの実装）</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left">
                  <th className="py-1" />
                  <th>{standardV2.shortName}</th>
                  <th>{friendlyV2.shortName}</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([l, f]) => (
                  <tr key={l} className="border-t border-slate-200 align-top dark:border-slate-700">
                    <td className="py-1 pr-2 font-semibold">{l}</td>
                    <td className="pr-2">{f(standardV2)}</td>
                    <td>{f(friendlyV2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {[standardV2, friendlyV2].map((p) => (
          <section key={p.id}>
            <h3 className="mb-1 font-bold">出典：{p.sourceDoc}</h3>
            <ul className="list-disc space-y-0.5 pl-5 text-xs">
              {Object.entries({
                コート: p.refs.court,
                試合の種類: p.refs.matchTypes,
                持ち時間: p.refs.time,
                ジャックの投球: p.refs.jackThrow,
                ファウルジャック: p.refs.jackFoul,
                最初のカラー球: `${p.refs.firstColor}／${p.refs.firstColorOut}`,
                残りの球: p.refs.remaining,
                アウト: p.refs.out,
                ジャックのアウト: p.refs.jackOut,
                等距離: p.refs.equidistant,
                得点: p.refs.scoring,
                タイブレイク: p.refs.tieBreak,
                ペナルティ: p.refs.penalty,
              }).map(([k, v]) => (
                <li key={k}>
                  {k}：{v}
                </li>
              ))}
              {p.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-700 dark:bg-amber-900/30">
          <h3 className="mb-1 font-bold">このツールの限界</h3>
          <p>
            本アプリは『日本ボッチャ協会競技規則 2021–2024 v.2.0』および『同 フレンドリーマッチ版 v.2.0』に基づくトレーニングツールです。最新の公式規則への準拠や審判判定の代替は保証しません。大会固有の申し合わせや審判の判断が優先されます。投球速度・摩擦・跳ね返りなどの物理挙動は再現しません。持ち時間タイマーは審判用の公式時計ではありません。
          </p>
        </section>
      </div>
    </Modal>
  );
}
