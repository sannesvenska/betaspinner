import { useTranslation } from 'react-i18next';
import { ActionCardsPanel } from '@renderer/features/library/ActionCardsPanel';
import { DraftAdminSection } from '@renderer/features/draft/DraftAdminSection';
import { FoldersSection } from '@renderer/features/library/FoldersSection';
import { MediaLibrarySection } from '@renderer/features/media/MediaLibrarySection';
import { SettingsForm } from '@renderer/features/settings/SettingsForm';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useUiStore, type AdminSection } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import {
  PenaltiesSection,
  PerformersSection,
  SessionRulesSection,
  VisualEffectsSection,
} from './RuleSections';

const SECTIONS: readonly AdminSection[] = [
  'folders',
  'mediaLibrary',
  'actionCards',
  'rules',
  'performers',
  'draft',
  'visualEffects',
  'penalties',
  'controls',
];

function ControlsSection() {
  const { t } = useTranslation();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-title font-bold uppercase">{t('admin.section.controls')}</h2>
        <p className="text-body text-ink-2">{t('admin.intro.controls')}</p>
      </header>
      <SettingsForm showHotkey />
    </div>
  );
}

/** game-design §16 admin: every `default` value is configurable here (AP10). */
export function AdminScreen() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const section = useUiStore((state) => state.adminSection);
  const openAdmin = useUiStore((state) => state.openAdmin);
  const error = useGameConfigStore((state) => state.error);
  const dismissError = useGameConfigStore((state) => state.dismissError);

  let content;
  switch (section) {
    case 'folders':
      content = <FoldersSection />;
      break;
    case 'mediaLibrary':
      content = <MediaLibrarySection />;
      break;
    case 'actionCards':
      content = <ActionCardsPanel />;
      break;
    case 'rules':
      content = <SessionRulesSection />;
      break;
    case 'performers':
      content = <PerformersSection />;
      break;
    case 'draft':
      content = <DraftAdminSection />;
      break;
    case 'visualEffects':
      content = <VisualEffectsSection />;
      break;
    case 'penalties':
      content = <PenaltiesSection />;
      break;
    case 'controls':
      content = <ControlsSection />;
      break;
  }
  // Folders and action cards manage their own scrolling panes
  const ownLayout = section === 'folders' || section === 'actionCards' || section === 'mediaLibrary';

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line px-12 py-6">
        <Button
          variant="text"
          keyHint="Esc"
          onClick={() => {
            navigate('home');
          }}
        >
          <Icon name="arrowLeft" size={16} />
          {t('common.back')}
        </Button>
        <h1 className="font-display text-title font-bold uppercase">{t('admin.title')}</h1>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={t('admin.nav')}
          className="flex flex-col gap-1 border-r border-line bg-panel px-4 py-6"
        >
          {SECTIONS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-current={entry === section ? 'page' : undefined}
              onClick={() => {
                openAdmin(entry);
              }}
              className={classNames(
                'rounded-panel px-4 py-2.5 text-left font-display text-chip font-semibold uppercase tracking-chip transition-colors duration-150',
                entry === section
                  ? 'bg-surface text-ink'
                  : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
              )}
            >
              {t(`admin.section.${entry}`)}
            </button>
          ))}
        </nav>
        <div className={classNames('flex min-h-0 flex-col', !ownLayout && 'overflow-y-auto px-12 pt-8')}>
          {error && (
            <div className="px-12 pt-4">
              <Alert onDismiss={dismissError}>
                {error === 'invalid_config' ? t('admin.error.invalid') : error}
              </Alert>
            </div>
          )}
          {content}
        </div>
      </div>
    </main>
  );
}
