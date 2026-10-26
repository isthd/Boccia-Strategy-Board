import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUI } from '../../store/uiStore';
import { Btn } from '../ui';

export function Modal({ title, children, onClose, footer, wide, testId }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none dark:bg-slate-800 sm:rounded-2xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h2 className="text-base font-bold">{title}</h2>
          <Btn variant="ghost" onClick={onClose} ariaLabel="閉じる">✕</Btn>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-2 dark:border-slate-700">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmHost() {
  const req = useUI((s) => s.confirmReq);
  const close = useUI((s) => s.closeConfirm);
  if (!req) return null;
  return (
    <Modal
      title={req.title}
      onClose={() => close(false)}
      testId="confirm-dialog"
      footer={
        <>
          <Btn onClick={() => close(false)}>キャンセル</Btn>
          <Btn variant={req.danger ? 'danger' : 'primary'} onClick={() => close(true)} testId="confirm-ok">
            {req.okLabel}
          </Btn>
        </>
      }
    >
      <p className="whitespace-pre-wrap text-sm">{req.message}</p>
    </Modal>
  );
}

export function PromptHost() {
  const req = useUI((s) => s.promptReq);
  const close = useUI((s) => s.closePrompt);
  const [v, setV] = useState('');
  useEffect(() => setV(req?.initial ?? ''), [req]);
  if (!req) return null;
  const cls = 'w-full rounded-md border border-slate-300 bg-white px-2 py-2 dark:border-slate-600 dark:bg-slate-900';
  return (
    <Modal
      title={req.title}
      onClose={() => close(null)}
      testId="prompt-dialog"
      footer={
        <>
          <Btn onClick={() => close(null)}>キャンセル</Btn>
          <Btn variant="primary" onClick={() => close(v)} testId="prompt-ok">OK</Btn>
        </>
      }
    >
      <label className="block text-sm">
        <span className="mb-1 block">{req.label}</span>
        {req.multiline ? (
          <textarea className={`${cls} min-h-[100px]`} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        ) : (
          <input
            className={`${cls} min-h-[44px]`}
            value={v}
            onChange={(e) => setV(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') close(v);
            }}
            data-testid="prompt-input"
          />
        )}
      </label>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-md rounded-lg px-4 py-2 text-sm font-semibold shadow-lg ${
            t.kind === 'error' ? 'bg-rose-600 text-white' : t.kind === 'warn' ? 'bg-amber-400 text-black' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
