import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { App } from './app/App';
import { initPersistence } from './store/persistence';

// iOS Safari：ページ全体のピンチズーム・ダブルタップズームを抑止（コート内は独自ズーム）
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && (e.target as HTMLElement)?.closest?.('.court-wrap')) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

registerSW({ immediate: true });

void initPersistence().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
