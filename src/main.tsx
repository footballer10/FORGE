import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppShell } from './app/AppShell';
import { ensureLibrary } from './db/seedLibrary';
import './styles/index.css';

registerSW({ immediate: true });

// First run: fill the exercise library (idempotent). The picker shows a loading state meanwhile.
void ensureLibrary().catch((err) => console.error('Library seed failed', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
