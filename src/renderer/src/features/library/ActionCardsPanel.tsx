import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cardGroup } from '@shared/session/selectActionPool';
import type { CardDistribution, SimulationResult } from '@shared/session/simulateSessions';
import type { ActionCardDefinition } from '@shared/session/types';
import { ActionCardEditor } from '@renderer/features/admin/ActionCardEditor';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { actionCardName, useActionCardsStore } from '@renderer/stores/actionCardsStore';
import { Alert } from '@renderer/ui/Alert';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { Media } from '@renderer/ui/Media';
import { Switch } from '@renderer/ui/Switch';
import { TextField } from '@renderer/ui/TextField';

const THUMBNAIL_ICON_SIZE = 36;
const SIMULATION_RUNS = 1000;
const PERCENT = 100;
const DECIMALS = 1;
/** Main-process error codes with a friendly message. */
const KNOWN_ERRORS = ['image_in_use', 'built_in', 'not_found'] as const;

function CardRow({
  card,
  cards,
  distribution,
}: {
  card: ActionCardDefinition;
  cards: readonly ActionCardDefinition[];
  distribution: CardDistribution | undefined;
}) {
  const { t } = useTranslation();
  const { update, duplicate, remove, reset, pickImage, clearImage } = useActionCardsStore();
  // null = not editing; shows the stored name so external updates stay visible
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
          {typeName} · {card.builtIn ? t('library.cards.builtIn') : t('library.cards.variant')} ·{' '}
          {t('library.cards.weight', { weight: card.weight })}
        </div>
        {distribution && (
          <div className="text-body-sm text-ink-2">
            {t('library.cards.distribution', {
              share: (distribution.poolShare * PERCENT).toFixed(0),
              count: distribution.avgCount.toFixed(DECIMALS),
            })}
          </div>
        )}
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
          variant={editing ? 'primary' : 'outline'}
          aria-expanded={editing}
          onClick={() => {
            setEditing((current) => !current);
          }}
        >
          {t('library.cards.edit')}
        </Button>
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
      {editing && (
        <div className="col-span-3 rounded-panel bg-panel px-6 pt-4">
          <ActionCardEditor card={card} label={label} />
        </div>
      )}
    </li>
  );
}

function SimulationSummary({ result }: { result: SimulationResult }) {
  const { t } = useTranslation();
  const stats = [
    [
      t('library.sim.actionCards'),
      `${result.avgActionCards.toFixed(DECIMALS)} (${result.avgGoodActions.toFixed(DECIMALS)} / ${result.avgBadActions.toFixed(DECIMALS)})`,
    ],
    [t('library.sim.poolSize'), result.avgPoolSize.toFixed(DECIMALS)],
    [t('library.sim.collectibles'), result.avgCollectibles.toFixed(DECIMALS)],
    [t('library.sim.performer'), `${(result.performerShare * PERCENT).toFixed(0)} %`],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-wrap gap-10">
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="font-label text-label uppercase tracking-label text-ink-muted">{label}</dt>
            <dd className="font-display text-stat font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body-sm text-ink-muted">
        {t('library.sim.runs', { runs: result.runs })}
        {result.failed > 0 && (
          <span className="text-bad"> · {t('library.sim.failed', { count: result.failed })}</span>
        )}
      </p>
    </div>
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
  const simulation = useGameConfigStore((state) => state.simulation);
  const simulating = useGameConfigStore((state) => state.simulating);
  const simulate = useGameConfigStore((state) => state.simulate);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-12 py-8">
      <p className="mb-6 max-w-3xl text-body text-ink-2">{t('library.cards.intro')}</p>
      <section className="mb-10 flex max-w-6xl flex-col gap-4 rounded-panel bg-panel px-6 py-5">
        <div className="flex items-center gap-4">
          <h2 className="font-label text-label uppercase tracking-label text-ink-muted">
            {t('library.sim.title')}
          </h2>
          <Button variant="outline" disabled={simulating} onClick={() => void simulate(SIMULATION_RUNS)}>
            <Icon name="refresh" size={16} />
            {simulating ? t('library.sim.running') : t('library.sim.run', { runs: SIMULATION_RUNS })}
          </Button>
        </div>
        {simulation ? (
          <SimulationSummary result={simulation} />
        ) : (
          <p className="text-body-sm text-ink-muted">{t('library.sim.hint')}</p>
        )}
      </section>
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
                  <CardRow
                    key={card.id}
                    card={card}
                    cards={cards}
                    distribution={simulation?.cards.find((entry) => entry.id === card.id)}
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
