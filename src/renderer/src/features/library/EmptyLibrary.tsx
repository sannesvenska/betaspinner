import { useTranslation } from 'react-i18next';
import { useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { Icon } from '@renderer/ui/icons/Icon';
import { useAddFolders } from './useAddFolders';

/** First-run state on the start screen: no folders registered yet. */
export function EmptyLibrary() {
  const { t } = useTranslation();
  const setupSteps = [t('library.empty.step1'), t('library.empty.step2'), t('library.empty.step3')];
  const navigate = useUiStore((state) => state.navigate);
  const addFlow = useAddFolders(() => {
    navigate('library');
  });

  return (
    <section className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="font-label text-label uppercase tracking-label text-ink-muted">
          {t('library.empty.eyebrow')}
        </div>
        <h1 className="font-display text-display font-bold uppercase">{t('library.empty.title')}</h1>
        <p className="text-body text-ink-2">{t('library.empty.body')}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {setupSteps.map((step, index) => (
          <li key={step} className="flex items-baseline gap-4">
            <span className="font-display text-stat font-semibold text-ink-muted">{index + 1}</span>
            <span className="text-body text-ink-2">{step}</span>
          </li>
        ))}
      </ol>
      {addFlow.pickError && <Alert>{addFlow.pickError}</Alert>}
      <div>
        <Button variant="primary" size="primary" onClick={() => void addFlow.start()}>
          <Icon name="plus" size={20} />
          {t('library.addFolders')}
        </Button>
      </div>
      {addFlow.dialog}
    </section>
  );
}
