import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Showcase } from './dev/Showcase';
import { GameFlow } from './features/game/GameFlow';
import { PauseScreen } from './features/game/PauseScreen';
import { LibraryScreen } from './features/library/LibraryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { useLibraryStore } from './stores/libraryStore';
import { useSessionStore } from './stores/sessionStore';
import { useUiStore } from './stores/uiStore';

export function App() {
  const { t } = useTranslation();
  const screen = useUiStore((state) => state.screen);
  const settingsState = useUiStore((state) => state.settingsState);
  const loadSettings = useUiStore((state) => state.loadSettings);
  const navigate = useUiStore((state) => state.navigate);

  const paused = useUiStore((state) => state.paused);
  const togglePause = useUiStore((state) => state.togglePause);
  const answerResume = useUiStore((state) => state.answerResume);
  const loadSession = useSessionStore((state) => state.load);
  const sessionSnapshot = useSessionStore((state) => state.snapshot);
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

  const subscribeSession = useSessionStore((state) => state.subscribe);
  useEffect(() => {
    const unsubscribe = subscribeSession();
    void loadSession();
    return unsubscribe;
  }, [loadSession, subscribeSession]);

  // Nothing to resume when the app starts without a session
  const hasLoadedSession = sessionSnapshot !== null;
  const startedWithoutSession = hasLoadedSession && sessionSnapshot.session === null;
  useEffect(() => {
    if (startedWithoutSession) answerResume();
  }, [startedWithoutSession, answerResume]);

  // Global pause hotkey from main + in-app key (instant, game-design §19)
  useEffect(() => window.api.on('app:togglePause', togglePause), [togglePause]);

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

  const session = sessionSnapshot?.session ?? null;
  let content;
  if (screen === 'showcase' && import.meta.env.DEV) content = <Showcase />;
  else if (screen === 'library') content = <LibraryScreen />;
  else if (!hasLoadedSession)
    content = <div className="p-12 font-label text-label text-ink-muted">{t('app.loading')}</div>;
  else if (session) content = <GameFlow session={session} />;
  else content = <HomeScreen />;

  return (
    <>
      {content}
      {paused && <PauseScreen />}
    </>
  );
}
