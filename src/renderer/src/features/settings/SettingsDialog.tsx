import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '@shared/settings';
import { playCue } from '@renderer/sound/sound';
import { useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { Switch } from '@renderer/ui/Switch';

/** Discrete choices instead of free sliders – every value is reachable by keyboard in one step. */
const VOLUME_LEVELS = { low: 0.3, medium: 0.6, high: 1 } as const;
const SPEED_LEVELS = { fast: 0.6, normal: 1, slow: 1.5 } as const;

type VolumeLevel = keyof typeof VOLUME_LEVELS;
type SpeedLevel = keyof typeof SPEED_LEVELS;

const closest = <K extends string>(levels: Readonly<Record<K, number>>, value: number): K =>
  (Object.entries(levels) as [K, number][]).reduce((best, entry) =>
    Math.abs(entry[1] - value) < Math.abs(best[1] - value) ? entry : best,
  )[0];

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** App-level settings (sound, motion, window). The full admin area follows in AP10. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const settingsState = useUiStore((state) => state.settingsState);
  const saveSettings = useUiStore((state) => state.saveSettings);
  const [error, setError] = useState<string | null>(null);
  if (settingsState.status !== 'ready') return null;
  const settings = settingsState.settings;

  const update = async (patch: Partial<AppSettings>) => {
    setError(await saveSettings({ ...settings, ...patch }));
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('settings.title')}>
      <div className="flex flex-col gap-6 px-8 py-6">
        {error && (
          <Alert
            onDismiss={() => {
              setError(null);
            }}
          >
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap items-end gap-6">
          <Switch
            label={t('settings.sound')}
            checked={settings.sound.enabled}
            onChange={(enabled) => void update({ sound: { ...settings.sound, enabled } })}
          />
          <SegmentedControl<VolumeLevel>
            label={t('settings.volume')}
            value={closest(VOLUME_LEVELS, settings.sound.volume)}
            disabled={!settings.sound.enabled}
            options={(Object.keys(VOLUME_LEVELS) as VolumeLevel[]).map((level) => ({
              value: level,
              label: t(`settings.volumeLevel.${level}`),
            }))}
            onChange={(level) => void update({ sound: { ...settings.sound, volume: VOLUME_LEVELS[level] } })}
          />
          <Button
            variant="outline"
            disabled={!settings.sound.enabled}
            onClick={() => {
              playCue('reveal-good');
            }}
          >
            {t('settings.testSound')}
          </Button>
        </div>
        <SegmentedControl<SpeedLevel>
          label={t('settings.animationSpeed')}
          value={closest(SPEED_LEVELS, settings.animationSpeed)}
          disabled={settings.reducedMotion}
          options={(Object.keys(SPEED_LEVELS) as SpeedLevel[]).map((level) => ({
            value: level,
            label: t(`settings.speed.${level}`),
          }))}
          onChange={(level) => void update({ animationSpeed: SPEED_LEVELS[level] })}
        />
        <div className="flex flex-col gap-1">
          <Switch
            label={t('settings.reducedMotion')}
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => void update({ reducedMotion })}
          />
          <span className="text-body-sm text-ink-muted">{t('settings.reducedMotionHint')}</span>
        </div>
        <Switch
          label={t('settings.startFullscreen')}
          checked={settings.startFullscreen}
          onChange={(startFullscreen) => void update({ startFullscreen })}
        />
      </div>
      <div className="flex justify-end px-8 pb-7">
        <Button variant="primary" keyHint="Esc" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
