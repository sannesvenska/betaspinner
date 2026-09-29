import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initI18n } from './i18n/i18n';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');

  const settings = await window.api.invoke('settings:load', undefined);
  await initI18n(settings.ok ? settings.data.languagePack : undefined);

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  // Last resort: i18n may not be ready, so no translated text here
  console.error('[renderer] bootstrap failed', error);
  document.body.textContent = 'Chance Runner failed to start.';
});
