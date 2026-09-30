import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidAccelerator, type AppSettings } from '@shared/settings';
import { playCue } from '@renderer/sound/sound';
import { useUiStore } from '@renderer/stores/uiStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { KeyHint } from '@renderer/ui/KeyHint';
import { SegmentedControl } from '@renderer/ui/SegmentedControl';
import { Switch } from '@renderer/ui/Switch';
import { acceleratorFromEvent, displayAccelerator } from './accelerator';

/** Discrete choices instead of free sliders – every value is reachable by keyboard in one step. */
const VOLUME_LEVELS = { low: 0.3, medium: 0.6, high: 1 } as const;
const SPEED_LEVELS = { fast: 0.6, normal: 1, slow: 1.5 } as const;

type VolumeLevel = keyof typeof VOLUME_LEVELS;
type SpeedLevel = keyof typeof SPEED_LEVELS;

const closest = <K extends string>(levels: Readonly<Record<K, number>>, value: number): K =>
  (Object.entries(levels) as [K, number][]).reduce((best, entry) =>
    Math.abs(entry[1] - value) < Math.abs(best[1] - value) ? entry : best,
  )[0];

function HotkeyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const [capturing, setCapturing] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const accelerator = acceleratorFromEvent(event);
      if (!accelerator) return;
      if (!isValidAccelerator(accelerator)) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      setCapturing(false);
      onChange(accelerator);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [capturing, onChange]);

  return (
    <div className="flex flex-col gap-2">
      <span className="font-label text-label uppercase tracking-label text-ink-muted">
        {t('settings.pauseHotkey')}
      </span>
      <div className="flex items-center gap-3">
        <KeyHint keys={displayAccelerator(value)} />
        <Button
          variant={capturing ? 'primary' : 'outline'}
          onClick={() => {
            setInvalid(false);
            setCapturing((current) => !current);
          }}
        >
          {capturing ? t('settings.hotkeyCapturing') : t('settings.hotkeyChange')}
        </Button>
      </div>
      <span className={`text-body-sm ${invalid ? 'text-bad' : 'text-ink-muted'}`}>
        {invalid ? t('settings.hotkeyInvalid') : t('settings.hotkeyHint')}
      </span>
    </div>
  );
}

/** App-level settings (sound, motion, window, pause hotkey) – used by the start screen dialog and the admin. */
export function SettingsForm({ showHotkey = false }: { showHotkey?: boolean }) {
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
    <div className="flex flex-col gap-6">
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
      {showHotkey && (
        <HotkeyField value={settings.pauseHotkey} onChange={(pauseHotkey) => void update({ pauseHotkey })} />
      )}
    </div>
  );
}
