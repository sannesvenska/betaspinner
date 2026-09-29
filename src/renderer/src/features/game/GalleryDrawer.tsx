import { useTranslation } from 'react-i18next';
import type { SessionMediaKinds } from '@shared/ipc';
import type { Card } from '@shared/session/types';
import { classNames } from '@renderer/ui/classNames';
import { Drawer } from '@renderer/ui/Dialog';
import { Icon } from '@renderer/ui/icons/Icon';
import { Media } from '@renderer/ui/Media';

interface GalleryDrawerProps {
  open: boolean;
  onClose: () => void;
  cards: readonly Card[];
  mediaKinds: SessionMediaKinds;
}

/** Discovered cards (game-design §7.1) – read-only, opened with G. */
export function GalleryDrawer({ open, onClose, cards, mediaKinds }: GalleryDrawerProps) {
  const { t } = useTranslation();
  const discovered = cards.filter((card) => card.discovered && card.kind !== 'goal');

  return (
    <Drawer open={open} onClose={onClose} title={t('game.galleryTitle')}>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {discovered.length === 0 ? (
          <p className="text-body text-ink-muted">{t('game.galleryEmpty')}</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {discovered.map((card) => {
              const kind = card.imageHash ? mediaKinds[card.imageHash] : undefined;
              return (
                <li key={card.field} className="flex flex-col gap-1.5">
                  <div
                    className={classNames(
                      'aspect-square overflow-hidden border-l-3 bg-stage',
                      card.group === 'good' ? 'border-good' : 'border-bad',
                    )}
                  >
                    {card.imageHash && kind ? (
                      <Media hash={card.imageHash} kind={kind} variant="thumbnail" />
                    ) : card.action ? (
                      <div className="flex h-full items-center justify-center text-ink-muted">
                        <Icon name={card.action} size={40} />
                      </div>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-1.5 font-label text-key uppercase tracking-label text-ink-muted">
                    {t('game.fieldLabel', { field: card.field })}
                    {card.action && !card.actionConsumed && <Icon name={card.action} size={12} />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
