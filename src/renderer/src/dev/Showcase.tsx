import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTION_IDS, actionGroup } from '@shared/actions';
import { AddFoldersDialog } from '@renderer/features/library/AddFoldersDialog';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { Chip } from '@renderer/ui/Chip';
import { Countdown } from '@renderer/ui/Countdown';
import { Dialog, Drawer, DIALOG_AUTOFOCUS } from '@renderer/ui/Dialog';
import { GroupCount } from '@renderer/ui/GroupCount';
import { HoldToConfirm } from '@renderer/ui/HoldToConfirm';
import { Icon } from '@renderer/ui/icons/Icon';
import { Stat } from '@renderer/ui/Stat';
import { Tooltip } from '@renderer/ui/Tooltip';
import { useCountdown } from '@renderer/ui/useCountdown';

const DEMO_COUNTDOWN_SECONDS = 8;
const SHOWCASE_ICON_SIZE = 32;
const SAMPLE_FOLDER_PATHS = ['D:/Pictures/Lingerie', 'D:/Pictures/Actions/Bad'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-6">
      <h2 className="font-label text-label uppercase tracking-label text-ink-muted">{title}</h2>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

/** Dev-only gallery of every UI building block with fixture data (roadmap AP1.9). */
export function Showcase() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [countdownRun, setCountdownRun] = useState(0);
  const countdown = useCountdown(DEMO_COUNTDOWN_SECONDS, dialogOpen || drawerOpen, countdownRun);
  const endEarlyHintId = useId();

  return (
    <main className="h-full overflow-y-auto bg-panel px-12 py-8 select-text">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-title font-bold uppercase">{t('showcase.title')}</h1>
          <Button
            variant="text"
            keyHint="Esc"
            onClick={() => {
              navigate('home');
            }}
          >
            {t('common.back')}
          </Button>
        </header>

        <Section title={t('showcase.buttons')}>
          <Button variant="primary" size="primary" keyHint="Space">
            {t('showcase.primary')}
          </Button>
          <Button variant="outline" keyHint="G">
            <Icon name="gallery" size={16} />
            {t('console.gallery')}
          </Button>
          <Button variant="text">{t('showcase.text')}</Button>
          <Button variant="outline" disabled>
            {t('showcase.disabled')}
          </Button>
          <Tooltip content={t('console.pauseHint')}>
            {(describedById) => (
              <Button variant="outline" aria-describedby={describedById}>
                <Icon name="pause" size={16} />
                {t('console.pause')}
              </Button>
            )}
          </Tooltip>
        </Section>

        <Section title={t('showcase.chips')}>
          <Chip
            group="bad"
            icon="double_trouble"
            name={t('effect.double_trouble.name')}
            meta={t('common.roundsShort', { count: 3 })}
            description={t('effect.double_trouble.description')}
          />
          <Chip
            group="bad"
            icon="pixelate"
            name={t('effect.pixelate.name')}
            meta={t('common.level', { level: 2 })}
            description={t('effect.pixelate.description')}
          />
          <Chip
            group="bad"
            icon="take_it_slow"
            name={t('effect.pace_slow.name')}
            meta={t('common.roundsShort', { count: 2 })}
            description={t('effect.pace_slow.description')}
          />
          <Chip
            group="good"
            icon="hail_mary"
            name={t('effect.success_multiplier.name')}
            meta="×2.0"
            description={t('effect.success_multiplier.description')}
          />
        </Section>

        <Section title={t('showcase.stats')}>
          <div className="grid grid-cols-2 gap-x-16 gap-y-5">
            <Stat label={t('console.round')}>18</Stat>
            <Stat label={t('console.discovered')}>
              23<span className="text-ink-muted"> / 100</span>
            </Stat>
            <Stat label={t('console.actionsLeft')}>
              <GroupCount good={4} bad={8} />
            </Stat>
            <Stat label={t('console.winMultiplier')} className="text-good">
              ×2.0
            </Stat>
          </div>
        </Section>

        <Section title={t('showcase.countdown')}>
          <Countdown secondsRemaining={countdown.secondsRemaining} totalSeconds={DEMO_COUNTDOWN_SECONDS} />
          <Button
            variant="outline"
            onClick={() => {
              setCountdownRun((run) => run + 1);
            }}
          >
            {t('showcase.restart')}
          </Button>
        </Section>

        <Section title={t('showcase.holdToConfirm')}>
          <HoldToConfirm
            describedBy={endEarlyHintId}
            onConfirm={() => {
              setConfirmedCount((count) => count + 1);
            }}
          >
            {t('console.endEarly')}
          </HoldToConfirm>
          <span id={endEarlyHintId} className="text-body-sm text-ink-2">
            {t('console.endEarlyHint')}
          </span>
          <span className="font-label text-label text-ink-muted">
            {t('showcase.confirmed')}: {confirmedCount}
          </span>
        </Section>

        <Section title={t('showcase.overlays')}>
          <Button
            variant="outline"
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            {t('showcase.openDialog')}
          </Button>
          <Button
            variant="outline"
            keyHint="G"
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            {t('showcase.openDrawer')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setWizardOpen(true);
            }}
          >
            {t('showcase.openFolderSetup')}
          </Button>
        </Section>

        <Section title={t('showcase.icons')}>
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {ACTION_IDS.map((id) => {
              const group = actionGroup(id);
              return (
                <div
                  key={id}
                  className={`flex flex-col gap-3 rounded-panel border-l-3 bg-surface p-4 ${
                    group === 'good' ? 'border-good text-good' : 'border-bad text-bad'
                  }`}
                >
                  <Icon name={id} size={SHOWCASE_ICON_SIZE} />
                  <span className="font-display text-chip font-semibold uppercase tracking-chip text-ink">
                    {t(`action.${id}.name`)}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
        }}
        title={t('showcase.dialogTitle')}
      >
        <p className="px-8 py-4 text-body text-ink-2">{t('showcase.dialogBody')}</p>
        <div className="flex justify-end gap-3 px-8 pb-7">
          <Button
            variant="text"
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            keyHint="Enter"
            {...DIALOG_AUTOFOCUS}
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            {t('common.done')}
          </Button>
        </div>
      </Dialog>

      {wizardOpen && (
        <AddFoldersDialog
          paths={SAMPLE_FOLDER_PATHS}
          onCancel={() => {
            setWizardOpen(false);
          }}
          onSubmit={() => {
            setWizardOpen(false);
            return Promise.resolve();
          }}
        />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
        title={t('showcase.drawerTitle')}
      >
        <p className="px-8 py-4 text-body text-ink-2">{t('showcase.drawerBody')}</p>
        <div className="mt-auto flex justify-end px-8 pb-7">
          <Button
            variant="outline"
            keyHint="Esc"
            onClick={() => {
              setDrawerOpen(false);
            }}
          >
            {t('common.close')}
          </Button>
        </div>
      </Drawer>
    </main>
  );
}
