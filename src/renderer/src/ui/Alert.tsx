import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Icon } from './icons/Icon';

interface AlertProps {
  children: ReactNode;
  onDismiss?: () => void;
}

/** Inline error/warning next to the place it concerns. */
export function Alert({ children, onDismiss }: AlertProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-panel border-l-3 border-bad bg-surface px-4 py-3"
    >
      <Icon name="warning" size={20} className="shrink-0 text-bad" />
      <div className="flex-1 text-body-sm text-ink-2">{children}</div>
      {onDismiss && (
        <Button variant="text" onClick={onDismiss}>
          {t('common.dismiss')}
        </Button>
      )}
    </div>
  );
}
