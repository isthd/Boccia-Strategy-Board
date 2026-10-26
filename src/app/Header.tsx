import { useDoc } from '../store/derived';
import { useUI } from '../store/uiStore';
import * as A from '../store/actions';
import { PROFILE_IDS, getProfile } from '../domain/rules/registry';
import type { RuleProfileId } from '../domain/types';

export function Header() {
  const doc = useDoc();
  const ui = useUI();
  const isMatch = doc.mode === 'match';
  const seg = (active: boolean) =>
    `min-h-[40px] px-3 text-sm font-bold rounded-md transition ${active ? 'bg-white text-slate-900 shadow dark:bg-slate-200' : 'text-slate-200 hover:bg-white/10'}`;

  return (
    <header className="safe-top no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto bg-slate-900 px-2 py-1.5 text-white">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <img src="./icon.svg" alt="" className="h-7 w-7" />
        <div className="min-w-0">
          <div className="hidden text-[10px] leading-none text-slate-400 sm:block">Boccia Strategy Board</div>
          <button
            className="max-w-[40vw] truncate text-left text-sm font-bold leading-tight hover:underline"
            onClick={async () => {
              const t = await ui.prompt({ title: '盤面の名前', label: '名前', initial: doc.title });
              if (t) A.setTitle(t);
            }}
            title="名前を変更"
            data-testid="doc-title"
          >
            {doc.title}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 rounded-lg bg-slate-700 p-0.5" role="group" aria-label="モード">
        <button
          className={seg(!isMatch)}
          onClick={() => {
            if (isMatch) A.branchMatchToSandbox(null);
          }}
          aria-pressed={!isMatch}
          data-testid="mode-sandbox"
        >
          自由配置
        </button>
        <button
          className={seg(isMatch)}
          onClick={() => {
            if (!isMatch) ui.openDialog('matchSetup');
            else ui.setTab('match');
          }}
          aria-pressed={isMatch}
          data-testid="mode-match"
        >
          試合再現
        </button>
      </div>

      <div className="flex shrink-0 rounded-lg bg-slate-700 p-0.5" role="group" aria-label="規則版">
        {PROFILE_IDS.map((id: RuleProfileId) => (
          <button key={id} className={seg(doc.profileId === id)} onClick={() => void A.setProfile(id)} aria-pressed={doc.profileId === id} data-testid={`profile-${id}`}>
            {getProfile(id).shortName}
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button className="hdr-btn" onClick={() => ui.openDialog('scenarios')} data-testid="open-scenarios">保存一覧</button>
        <button className="hdr-btn" onClick={() => ui.openDialog('export')} data-testid="open-export">書出・共有</button>
        <button className="hdr-btn" onClick={() => ui.openDialog('help')} aria-label="ヘルプ" data-testid="open-help">？</button>
      </div>
    </header>
  );
}
