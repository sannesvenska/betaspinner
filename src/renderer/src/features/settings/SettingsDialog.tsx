import { useTranslation } from 'react-i18next';
import { Button } from '@renderer/ui/Button';
import { Dialog } from '@renderer/ui/Dialog';
import { SettingsForm } from './SettingsForm';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Quick settings on the start screen; the full set (incl. pause hotkey) lives in the admin. */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('settings.title')}>
      <div className="px-8 py-6">
        <SettingsForm />
      </div>
      <div className="flex justify-end px-8 pb-7">
        <Button variant="primary" keyHint="Esc" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
