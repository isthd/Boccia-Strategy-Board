// コート表示の 2D／3D 切替
import { useUI, type ViewMode } from '../../store/uiStore';

const MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: '2d', label: '2D', title: '真上から見た平面表示' },
  { id: '3d', label: '3D', title: '立体表示（視点を回して見る）' },
];

export function ViewModeToggle() {
  const mode = useUI((s) => s.viewMode);
  const setMode = useUI((s) => s.setViewMode);
  return (
    <div className="pointer-events-auto flex overflow-hidden rounded-lg bg-slate-900/80 text-xs font-bold shadow" role="group" aria-label="表示方式">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          aria-pressed={mode === m.id}
          title={m.title}
          data-testid={`view-${m.id}`}
          className={`min-h-[32px] min-w-[40px] px-2 ${mode === m.id ? 'bg-amber-400 text-black' : 'text-white hover:bg-white/10'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
