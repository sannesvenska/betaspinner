import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Showcase } from './dev/Showcase';
import { LibraryScreen } from './features/library/LibraryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { useLibraryStore } from './stores/libraryStore';
import { useUiStore } from './stores/uiStore';

export function App() {
  const { t } = useTranslation();
  const screen = useUiStore((state) => state.screen);
  const settingsState = useUiStore((state) => state.settingsState);
  const loadSettings = useUiStore((state) => state.loadSettings);
  const navigate = useUiStore((state) => state.navigate);

  const loadLibrary = useLibraryStore((state) => state.load);
  const subscribeLibrary = useLibraryStore((state) => state.subscribe);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const unsubscribe = subscribeLibrary();
    void loadLibrary();
    return unsubscribe;
  }, [loadLibrary, subscribeLibrary]);

  const reducedMotion = settingsState.status === 'ready' && settingsState.settings.reducedMotion;
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  // Esc goes back to the start screen from sub screens (open dialogs consume Esc first)
  useEffect(() => {
    if (screen === 'home') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = document.querySelector('dialog[open]') !== null;
      if (event.key === 'Escape' && !modalOpen) navigate('home');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [screen, navigate]);

  if (settingsState.status === 'loading') {
    return <div className="p-12 font-label text-label text-ink-muted">{t('app.loading')}</div>;
  }
  if (settingsState.status === 'error') {
    return (
      <div className="p-12 text-body text-bad">{t('app.loadError', { error: settingsState.error })}</div>
    );
  }

  if (screen === 'showcase' && import.meta.env.DEV) return <Showcase />;
  if (screen === 'library') return <LibraryScreen />;
  return <HomeScreen />;
}
