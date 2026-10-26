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
    `min-h-[40px] px-2 sm:px-3 text-xs sm:text-sm font-bold rounded-md transition whitespace-nowrap ${active ? 'bg-white text-slate-900 shadow dark:bg-slate-200' : 'text-slate-300 hover:bg-white/10'}`;

  return (
    <header className="safe-top no-scrollbar flex shrink-0 items-center gap-1.5 overflow-x-auto bg-slate-900 px-2 py-1.5 text-white sm:gap-2">
      <div className="flex min-w-[64px] flex-1 items-center gap-2 sm:flex-none">
        <img src="./icon.svg" alt="" className="hidden h-7 w-7 shrink-0 sm:block" />
        <button
          className="flex min-h-[40px] max-w-full items-center gap-1 truncate rounded-md px-1 text-left text-sm font-bold leading-tight hover:bg-white/10 sm:max-w-[30vw]"
          onClick={async () => {
            const t = await ui.prompt({ title: '盤面の名前', label: '名前', initial: doc.title });
            if (t) A.setTitle(t);
          }}
          title="タップで名前を変更"
          data-testid="doc-title"
        >
          <span className="truncate">{doc.title}</span>
          <span className="shrink-0 text-xs text-slate-400" aria-hidden>✎</span>
        </button>
      </div>

      <div className="flex shrink-0 rounded-lg bg-slate-700 p-0.5" role="group" aria-label="モード">
        <button
          className={seg(!isMatch)}
          onClick={() => {
            if (isMatch) A.branchMatchToSandbox(null);
          }}
          aria-pressed={!isMatch}
          data-testid="mode-sandbox"
          title="投球順を気にせず自由に球を置いて作戦を考えます"
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
          title="規則どおりの投球順で試合を1投ずつ記録します"
        >
          試合再現
        </button>
      </div>

      <label className="relative hidden shrink-0 items-center sm:flex" title="適用する規則の版（「設定」タブでも変更できます）">
        <span className="sr-only">規則版</span>
        <select
          className="min-h-[40px] max-w-[96px] cursor-pointer appearance-none truncate rounded-lg bg-slate-700 py-0 pl-2 pr-6 text-xs font-bold sm:max-w-none sm:pl-2.5 sm:pr-7 sm:text-sm text-white hover:bg-slate-600"
          value={doc.profileId}
          onChange={(e) => void A.setProfile(e.target.value as RuleProfileId)}
          data-testid="profile-select"
        >
          {PROFILE_IDS.map((id: RuleProfileId) => (
            <option key={id} value={id}>
              {getProfile(id).shortName}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-1.5 text-[10px] sm:right-2 text-slate-300" aria-hidden>▼</span>
      </label>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button className="hdr-btn" onClick={() => ui.openDialog('scenarios')} data-testid="open-scenarios" aria-label="保存一覧" title="保存した盤面を開く">
          <span aria-hidden>📂</span>
          <span className="hidden md:inline">保存一覧</span>
        </button>
        <button className="hdr-btn" onClick={() => ui.openDialog('export')} data-testid="open-export" aria-label="書出・共有" title="画像・JSONで書き出し／共有">
          <span aria-hidden>⤴</span>
          <span className="hidden md:inline">書出・共有</span>
        </button>
        <button className="hdr-btn" onClick={() => ui.openDialog('help')} aria-label="ヘルプ" data-testid="open-help" title="使い方">
          ？
        </button>
      </div>
    </header>
  );
}
