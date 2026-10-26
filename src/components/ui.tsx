// 共通UI部品（タッチ操作向けに主要ボタンは高さ44px以上）
import { useEffect, useState, type ReactNode } from 'react';
import type { Side } from '../domain/types';

export function Btn({
  children,
  onClick,
  variant = 'default',
  className = '',
  disabled,
  title,
  active,
  ariaLabel,
  small,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'red' | 'blue' | 'ghost';
  className?: string;
  disabled?: boolean;
  title?: string;
  active?: boolean;
  ariaLabel?: string;
  small?: boolean;
  testId?: string;
}) {
  const base = small ? 'min-h-[36px] px-2.5 text-sm' : 'min-h-[44px] px-3';
  const styles: Record<string, string> = {
    default: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600',
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 border border-rose-700',
    red: 'bg-bred text-white hover:brightness-110 border border-red-900',
    blue: 'bg-bblue text-white hover:brightness-110 border border-blue-900',
    ghost: 'bg-transparent hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-800 dark:text-slate-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      data-testid={testId}
      className={`${base} inline-flex select-none items-center justify-center gap-1 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${active ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function Section({ title, children, right, testId }: { title: string; children: ReactNode; right?: ReactNode; testId?: string }) {
  return (
    <section className="mb-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'danger' }) {
  const c =
    kind === 'warn'
      ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-100 dark:border-amber-700'
      : kind === 'danger'
        ? 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-900/30 dark:text-rose-100 dark:border-rose-700'
        : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700';
  return <div className={`mt-1 rounded-md border px-2 py-1.5 text-xs leading-relaxed ${c}`}>{children}</div>;
}

export function Toggle({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex min-h-[40px] cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-6 w-6 accent-emerald-600" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    </label>
  );
}

/** 数値入力（確定時に onCommit）。cm単位表示などの換算は呼び出し側で行う */
export function NumField({
  label,
  value,
  onCommit,
  step = 1,
  unit,
  min,
  max,
  testId,
  width = 'w-24',
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  unit?: string;
  min?: number;
  max?: number;
  testId?: string;
  width?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onCommit(v);
    else setText(String(value));
  };
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        className={`${width} min-h-[40px] rounded-md border border-slate-300 bg-white px-2 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        data-testid={testId}
      />
      {unit && <span className="text-xs text-slate-500">{unit}</span>}
    </label>
  );
}

export function TextField({
  label,
  value,
  onCommit,
  multiline,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const cls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
  return (
    <label className="block text-sm">
      <span className="mb-0.5 block text-xs text-slate-600 dark:text-slate-300">{label}</span>
      {multiline ? (
        <textarea className={`${cls} min-h-[64px]`} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onCommit(text)} data-testid={testId} />
      ) : (
        <input
          className={`${cls} min-h-[40px]`}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && onCommit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          data-testid={testId}
        />
      )}
    </label>
  );
}

export function SideDot({ side, className = '' }: { side: Side | 'jack'; className?: string }) {
  const c = side === 'red' ? 'bg-bred' : side === 'blue' ? 'bg-bblue' : 'bg-white border border-slate-500';
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${c} ${className}`} aria-hidden />;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label && <span className="shrink-0 text-slate-600 dark:text-slate-300">{label}</span>}
      <select
        className="min-h-[40px] w-full rounded-md border border-slate-300 bg-white px-2 dark:border-slate-600 dark:bg-slate-900"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
