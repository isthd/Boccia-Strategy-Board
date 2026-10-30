// 試合設定：新規開始／進行中の試合の設定編集
import { useState } from 'react';
import { Modal } from './Modal';
import { Btn, NumField, Note, Select, TextField } from '../ui';
import { useDoc } from '../../store/derived';
import { useUI } from '../../store/uiStore';
import * as A from '../../store/actions';
import * as M from '../../domain/match';
import { PROFILE_IDS, getProfile, defaultTimeSec } from '../../domain/rules/registry';
import { MATCH_TYPE_LABEL, type MatchType, type RuleProfileId, sideLabel } from '../../domain/types';

export function MatchSetupDialog() {
  const doc = useDoc();
  const close = () => useUI.getState().openDialog(null);
  const editing = doc.mode === 'match' && doc.match ? doc.match : null;
  const [profileId, setProfileId] = useState<RuleProfileId>(doc.profileId);
  const profile = getProfile(profileId);
  const [setup, setSetup] = useState<M.MatchSetup>(() => (editing ? JSON.parse(JSON.stringify(editing.setup)) : M.defaultSetup(profile, 'individual')));
  const [title, setTitle] = useState(editing ? doc.title : `試合 ${new Date().toLocaleDateString('ja-JP')}`);
  const mt = profile.matchTypes[setup.matchType];

  const changeType = (t: MatchType, pid = profileId) => {
    const p = getProfile(pid);
    const next = M.defaultSetup(p, t);
    setSetup({ ...next, redName: setup.redName, blueName: setup.blueName });
  };
  const changeProfile = (pid: RuleProfileId) => {
    setProfileId(pid);
    changeType(setup.matchType, pid);
  };

  const start = () => {
    if (editing) {
      A.updateMatchSetup({ timeSec: setup.timeSec, redName: setup.redName, blueName: setup.blueName, players: setup.players, numEnds: setup.numEnds, classCode: setup.classCode });
      if (title !== doc.title) A.setTitle(title);
    } else {
      A.startMatch(profileId, setup, title);
    }
    close();
  };

  return (
    <Modal
      title={editing ? '試合設定' : '新しい試合を開始'}
      onClose={close}
      testId="match-setup"
      footer={
        <>
          <Btn onClick={close}>キャンセル</Btn>
          <Btn variant="primary" onClick={start} testId="match-start">
            {editing ? '保存' : '試合を開始'}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <TextField label="試合名" value={title} onCommit={setTitle} />
        {!editing && (
          <>
            <Select<RuleProfileId> label="規則版" value={profileId} options={PROFILE_IDS.map((id) => ({ value: id, label: getProfile(id).name }))} onChange={changeProfile} testId="setup-profile" />
            <Select<MatchType>
              label="試合形式"
              value={setup.matchType}
              options={(['individual', 'pair', 'team'] as MatchType[]).map((t) => ({ value: t, label: MATCH_TYPE_LABEL[t] }))}
              onChange={(t) => changeType(t)}
              testId="setup-type"
            />
          </>
        )}
        {profile.classes[setup.matchType].length > 1 && (
          <Select<string>
            label="競技クラス"
            value={setup.classCode ?? ''}
            options={profile.classes[setup.matchType].map((c) => ({ value: c.code, label: `${c.label}（${c.timeSec / 60}分）` }))}
            onChange={(code) => {
              const t = defaultTimeSec(profile, setup.matchType, code);
              setSetup({ ...setup, classCode: code, timeSec: { red: t, blue: t } });
            }}
          />
        )}
        <div className="flex flex-wrap gap-3">
          <NumField label="エンド数" value={setup.numEnds} min={1} max={20} width="w-16" onCommit={(v) => setSetup({ ...setup, numEnds: Math.round(v) })} />
          <NumField label="赤 持ち時間" unit="分" step={0.5} value={setup.timeSec.red / 60} min={0} max={120} width="w-20" onCommit={(v) => setSetup({ ...setup, timeSec: { ...setup.timeSec, red: Math.round(v * 60) } })} />
          <NumField label="青 持ち時間" unit="分" step={0.5} value={setup.timeSec.blue / 60} min={0} max={120} width="w-20" onCommit={(v) => setSetup({ ...setup, timeSec: { ...setup.timeSec, blue: Math.round(v * 60) } })} />
        </div>
        {mt.endsProvisional && <Note kind="warn">エンド数の初期値（個人・ペア4、チーム6）は通常版からの初期提案です。フレンドリー版の確定規則ではないため、大会の申し合わせを確認してください。</Note>}
        <Note>{profile.timeNote}</Note>
        <div className="grid grid-cols-2 gap-2">
          <TextField label="赤サイド名" value={setup.redName} onCommit={(redName) => setSetup({ ...setup, redName })} />
          <TextField label="青サイド名" value={setup.blueName} onCommit={(blueName) => setSetup({ ...setup, blueName })} />
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-600 dark:text-slate-300">
            選手（ボックス）— 1選手{mt.ballsPerPlayer}球、各サイド計{mt.ballsPerPlayer * mt.playersPerSide}球（{profile.refs.matchTypes}）
          </div>
          <div className="grid grid-cols-2 gap-2">
            {setup.players.map((p, i) => (
              <TextField
                key={p.box}
                label={`${p.box}番ボックス（${sideLabel(p.side)}）`}
                value={p.name}
                onCommit={(name) => {
                  const players = [...setup.players];
                  players[i] = { ...p, name };
                  setSetup({ ...setup, players });
                }}
              />
            ))}
          </div>
        </div>
        <Note>
          タイブレイク：{profile.tieBreak.label}（{profile.tieBreak.ruleRef}）。ペナルティボール：{profile.penaltyBalls ? '通常版の加点フローあり' : '加点フローなし'}。
        </Note>
      </div>
    </Modal>
  );
}
