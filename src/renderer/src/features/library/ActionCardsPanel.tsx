import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cardGroup } from '@shared/session/selectActionPool';
import type { ActionCardDefinition } from '@shared/session/types';
import { actionCardName, useActionCardsStore } from '@renderer/stores/actionCardsStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { Media } from '@renderer/ui/Media';
import { Switch } from '@renderer/ui/Switch';
import { TextField } from '@renderer/ui/TextField';

const THUMBNAIL_ICON_SIZE = 36;
/** Main-process error codes with a friendly message. */
const KNOWN_ERRORS = ['image_in_use', 'built_in', 'not_found'] as const;

function CardRow({ card, cards }: { card: ActionCardDefinition; cards: readonly ActionCardDefinition[] }) {
  const { t } = useTranslation();
  const { update, duplicate, remove, reset, pickImage, clearImage } = useActionCardsStore();
  // null = not editing; shows the stored name so external updates stay visible
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const group = cardGroup(card);
  const typeName = t(`action.${card.type}.name`);
  const label = actionCardName(t, cards, card.id, card.type);

  const commitName = () => {
    if (nameDraft === null) return;
    const trimmed = nameDraft.trim();
    // Empty name on a built-in = back to the translated name
    if (trimmed !== (card.name ?? '')) void update(card.id, { name: trimmed === '' ? null : trimmed });
    setNameDraft(null);
  };

  return (
    <li className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-6 border-t border-line py-4 first:border-t-0">
      <div
        className={classNames(
          'flex aspect-[3/4] items-center justify-center overflow-hidden border-l-3 bg-stage',
          group === 'good' ? 'border-good text-good' : 'border-bad text-bad',
        )}
      >
        {card.image ? (
          <Media hash={card.image.hash} kind={card.image.kind} variant="thumbnail" alt={label} />
        ) : (
          <Icon name={card.type} size={THUMBNAIL_ICON_SIZE} label={t('library.cards.neutral')} />
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2 font-label text-label uppercase tracking-label text-ink-muted">
          <Icon name={card.type} size={14} />
          {typeName} · {card.builtIn ? t('library.cards.builtIn') : t('library.cards.variant')}
        </div>
        <TextField
          label={t('library.cards.name')}
          value={nameDraft ?? card.name ?? ''}
          placeholder={typeName}
          onChange={(event) => {
            setNameDraft(event.target.value);
          }}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Switch
          label={card.enabled ? t('library.field.enabled') : t('library.field.disabled')}
          checked={card.enabled}
          onChange={(enabled) => void update(card.id, { enabled })}
        />
        <Button variant="outline" onClick={() => void pickImage(card.id)}>
          <Icon name="plus" size={16} />
          {card.image ? t('library.cards.replaceImage') : t('library.cards.chooseImage')}
        </Button>
        {card.image && (
          <Button variant="text" onClick={() => void clearImage(card.id)}>
            {t('library.cards.removeImage')}
          </Button>
        )}
        <Button
          variant="text"
          onClick={() => void duplicate(card.id, t('library.cards.copyName', { name: label }))}
        >
          {t('library.cards.duplicate')}
        </Button>
        {card.builtIn ? (
          <Button variant="text" onClick={() => void reset(card.id)}>
            <Icon name="refresh" size={16} />
            {t('library.cards.reset')}
          </Button>
        ) : (
          <Button variant="text" onClick={() => void remove(card.id)}>
            <Icon name="trash" size={16} />
            {t('library.cards.delete')}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * game-design §10.4: every action card is uniquely defined and has its own image.
 * Minimal editor until the admin (AP10) adds weights and params.
 */
export function ActionCardsPanel() {
  const { t } = useTranslation();
  const cards = useActionCardsStore((state) => state.cards);
  const error = useActionCardsStore((state) => state.error);
  const dismissError = useActionCardsStore((state) => state.dismissError);
  const known = KNOWN_ERRORS.find((code) => code === error);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-12 py-8">
      <p className="mb-6 max-w-3xl text-body text-ink-2">{t('library.cards.intro')}</p>
      {error && (
        <div className="mb-6 max-w-3xl">
          <Alert onDismiss={dismissError}>{known ? t(`library.cards.error.${known}`) : error}</Alert>
        </div>
      )}
      <div className="grid max-w-6xl grid-cols-1 gap-10">
        {(['good', 'bad'] as const).map((group) => (
          <section key={group}>
            <h2
              className={classNames(
                'mb-2 border-l-3 pl-3 font-label text-label uppercase tracking-label text-ink-muted',
                group === 'good' ? 'border-good' : 'border-bad',
              )}
            >
              {t(`library.cards.section.${group}`)}
            </h2>
            <ul>
              {cards
                .filter((card) => cardGroup(card) === group)
                .map((card) => (
                  <CardRow key={card.id} card={card} cards={cards} />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
