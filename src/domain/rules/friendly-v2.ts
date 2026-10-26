// フレンドリーマッチ版：『日本ボッチャ協会競技規則 フレンドリーマッチ版 v.2.0』
// 本文に明示がない事項は通常版から黙って流用せず、manual（主催者・審判判断が必要）とする。
import type { RuleProfile } from './profile';

const DOC = '日本ボッチャ協会競技規則 フレンドリーマッチ版 v.2.0';

export const friendlyV2: RuleProfile = {
  id: 'friendly-v2',
  name: 'フレンドリーマッチ版（日本ボッチャ協会競技規則 フレンドリーマッチ版 v.2.0）',
  shortName: 'フレンドリー版',
  sourceDoc: DOC,
  matchTypes: {
    individual: {
      ballsPerPlayer: 6,
      playersPerSide: 1,
      redBoxes: [3],
      blueBoxes: [4],
      // フレンドリー版本文にエンド数の明示なし → 通常版からの初期提案
      defaultEnds: 4,
      endsProvisional: true,
      // 第1エンドは赤（§8.3.1）。以降の交互は本文に明示なし → 初期提案
      jackRotationBoxes: [3, 4, 3, 4],
      jackRotationProvisional: true,
    },
    pair: {
      ballsPerPlayer: 3,
      playersPerSide: 2,
      redBoxes: [2, 4],
      blueBoxes: [3, 5],
      defaultEnds: 4,
      endsProvisional: true,
      jackRotationBoxes: [2, 3, 4, 5],
      jackRotationProvisional: true,
    },
    team: {
      ballsPerPlayer: 2,
      playersPerSide: 3,
      redBoxes: [1, 3, 5],
      blueBoxes: [2, 4, 6],
      defaultEnds: 6,
      endsProvisional: true,
      jackRotationBoxes: [1, 2, 3, 4, 5, 6],
      jackRotationProvisional: true,
    },
  },
  classes: {
    // フレンドリー版 §8.2.1 の標準：個人戦は各選手1エンドあたり4分、ペア・チームは各サイド5分
    individual: [{ code: 'individual', label: '個人戦（標準）', timeSec: 240 }],
    pair: [{ code: 'pair', label: 'ペア戦（標準）', timeSec: 300 }],
    team: [{ code: 'team', label: 'チーム戦（標準）', timeSec: 300 }],
  },
  timeNote:
    'フレンドリー版 §8.2.1 の標準（日本ボッチャ協会主催大会）。各サイドの持ち時間は主催者が決定するため編集できます。ジャック投球も持ち時間に含む（§8.2.2）。',
  timeRef: 'フレンドリー版 §8.2',
  unequalTieRule: 'manual',
  jackResetNoColorRule: 'manual',
  occupiedCrossRule: 'manual',
  finalEndJackFoul: 'manual',
  repeatedJackFoul: 'manual',
  tieBreak: {
    kind: 'finalShot',
    label: 'ファイナルショット',
    ruleRef: 'フレンドリー版 §10, §8.14.5',
    description:
      '規定エンド終了時に合計同点なら、ファイナルショットを行う。コイントスで投球順を決め、先に投球するサイドのジャックをクロスに置き、各サイド1球を1分以内に投球する。各サイドのスローイングボックスにいる任意の選手1名が投球（ボックス変更不可）。得点は試合の得点に加算せず、勝敗の判定にのみ使う。',
    ballsPerSide: 1,
    timeSec: 60,
  },
  penaltyBalls: false,
  showTargetBox: false,
  refs: {
    court: 'フレンドリー版 p.13–14 標準的なボッチャコートガイドライン／レイアウト',
    matchTypes: 'フレンドリー版 §2, §5',
    time: 'フレンドリー版 §8.2',
    jackThrow: 'フレンドリー版 §8.3',
    jackFoul: 'フレンドリー版 §8.4',
    firstColor: 'フレンドリー版 §8.5.1',
    firstColorOut: 'フレンドリー版 §8.5.2',
    opponentFirst: 'フレンドリー版 §8.6',
    remaining: 'フレンドリー版 §8.9',
    out: 'フレンドリー版 §8.10',
    jackOut: 'フレンドリー版 §8.11',
    equidistant: 'フレンドリー版 §8.12',
    scoring: 'フレンドリー版 §8.14',
    tieBreak: 'フレンドリー版 §10',
    penalty: 'フレンドリー版（ペナルティボールの規定なし。反則は §11 ボール除去）',
    bnp: 'フレンドリー版 §8.9.1',
  },
  notes: [
    'エンド数（個人・ペア4、チーム6）とジャック投球ローテーションは、フレンドリー版本文に明示がないため「通常版からの初期提案／大会要確認」です。',
    '等距離だが得点球数が異なる局面、最終エンドや連続したジャックファウル、クロスが塞がっている場合のジャック再配置、カラー球がない状態でのジャック再配置後の投球サイドは本文に明示がありません。「主催者・審判判断が必要」と表示し、手動で確定します。',
    'フレンドリー版には通常版と同等のペナルティボール加点フローを適用しません。反則行為はボール除去（リトラクション）として記録します（§11）。',
    'コート寸法は大会申し合わせで調整されることがあります（p.13）。',
  ],
};
