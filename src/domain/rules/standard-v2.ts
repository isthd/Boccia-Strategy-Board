// 通常版：『日本ボッチャ協会競技規則 2021–2024 v.2.0』
import type { RuleProfile } from './profile';

const DOC = '日本ボッチャ協会競技規則 2021–2024 v.2.0（通常版）';

export const standardV2: RuleProfile = {
  id: 'standard-2021-2024-v2',
  name: '通常版（日本ボッチャ協会競技規則 2021–2024 v.2.0）',
  shortName: '通常版',
  sourceDoc: DOC,
  matchTypes: {
    individual: {
      ballsPerPlayer: 6,
      playersPerSide: 1,
      redBoxes: [3],
      blueBoxes: [4],
      defaultEnds: 4,
      endsProvisional: false,
      // §2.1 各々2エンド交互にジャック投球。第1エンドは赤（§10.3.1）
      jackRotationBoxes: [3, 4, 3, 4],
      jackRotationProvisional: false,
    },
    pair: {
      ballsPerPlayer: 3,
      playersPerSide: 2,
      redBoxes: [2, 4],
      blueBoxes: [3, 5],
      defaultEnds: 4,
      endsProvisional: false,
      // §2.2 2番から5番の順にジャック投球
      jackRotationBoxes: [2, 3, 4, 5],
      jackRotationProvisional: false,
    },
    team: {
      ballsPerPlayer: 2,
      playersPerSide: 3,
      redBoxes: [1, 3, 5],
      blueBoxes: [2, 4, 6],
      defaultEnds: 6,
      endsProvisional: false,
      // §2.3 1番から6番の順に1回ずつジャック投球
      jackRotationBoxes: [1, 2, 3, 4, 5, 6],
      jackRotationProvisional: false,
    },
  },
  classes: {
    individual: [
      { code: 'BC1', label: 'BC1', timeSec: 300 },
      { code: 'BC2', label: 'BC2', timeSec: 240 },
      { code: 'BC3', label: 'BC3', timeSec: 360 },
      { code: 'BC4', label: 'BC4', timeSec: 240 },
      { code: 'OP-seated', label: 'OP座位', timeSec: 240 },
      { code: 'OP-standing', label: 'OP立位', timeSec: 240 },
    ],
    pair: [
      { code: 'BC3-pair', label: 'BC3ペア', timeSec: 420 },
      { code: 'BC4-pair', label: 'BC4ペア', timeSec: 300 },
    ],
    team: [{ code: 'team', label: 'チーム（BC1/BC2）', timeSec: 360 }],
  },
  timeNote: '通常版 §10.2.1 の持ち時間（サイドごと・1エンドあたり）。ジャック投球も持ち時間に含む（§10.2.2）。',
  timeRef: '通常版 §10.2',
  unequalTieRule: 'fewerScoringBalls',
  jackResetNoColorRule: 'knockerThrows',
  occupiedCrossRule: 'frontOfCross',
  finalEndJackFoul: 'firstEndThrower',
  repeatedJackFoul: 'continueRotation',
  tieBreak: {
    kind: 'extraEnd',
    label: 'タイブレイク（追加エンド）',
    ruleRef: '通常版 §13, §10.16.7',
    description:
      '規定エンド終了時に合計同点なら、通常のエンドと同様に両サイドが投球する追加エンドを行う。コイントスの勝者が投球順を決め、先攻サイドのジャックをクロスに置く。同点なら、前回後攻だったサイドのジャックで次のタイブレイクを繰り返す（§13.6）。タイブレイクの得点は試合の得点に加算しない。',
  },
  penaltyBalls: true,
  showTargetBox: true,
  refs: {
    court: '通常版 §3.1, p.35–36',
    matchTypes: '通常版 §2.1–2.3',
    time: '通常版 §10.2',
    jackThrow: '通常版 §10.3',
    jackFoul: '通常版 §10.4',
    firstColor: '通常版 §10.5.1',
    firstColorOut: '通常版 §10.5.2',
    opponentFirst: '通常版 §10.6',
    remaining: '通常版 §10.9',
    out: '通常版 §10.10',
    jackOut: '通常版 §10.11',
    equidistant: '通常版 §10.13',
    scoring: '通常版 §10.16',
    tieBreak: '通常版 §13',
    penalty: '通常版 §15.2, §10.15.2, §10.16.3',
    bnp: '通常版 §10.9.2',
  },
  notes: [
    'ペナルティボールは、反則の判定や成功判定を自動化しません。ユーザーがペナルティ球の付与と結果（ターゲットボックス内に停止したか）を確定し、得点に加算します（§15.2.1, §10.16.3）。',
    'ジャックがファウルの場合は次のエンドの担当選手が投球し、最終エンドでは第1エンドの担当選手が投球します。有効になるまで繰り返します（§10.4.2）。後続エンドの担当順は変わりません（§10.4.3）。',
    '等距離かつ同得点なら最後に投球したサイドが投球し、その後は交互に投球します。等距離で得点球数が異なる場合は、得点球の少ないサイドが投球します（§10.13）。',
  ],
};
