import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { actionGroup } from '@shared/actions';
import { effectiveGameConfig } from '@shared/config/gameConfig';
import { DRAFT_FIELD_TYPES } from '@shared/draft';
import { DEFAULT_SETTINGS } from '@shared/settings';
import type { EffectType } from '@shared/session/types';
import { EFFECT_ICONS, GOOD_EFFECTS } from '@renderer/features/game/effectIcons';
import { displayAccelerator } from '@renderer/features/settings/accelerator';
import {
  actionCardDescription,
  actionCardName,
  useActionCardsStore,
} from '@renderer/stores/actionCardsStore';
import { useGameConfigStore } from '@renderer/stores/gameConfigStore';
import { useUiStore } from '@renderer/stores/uiStore';
import { Button } from '@renderer/ui/Button';
import { classNames } from '@renderer/ui/classNames';
import { Icon } from '@renderer/ui/icons/Icon';
import { KeyHint } from '@renderer/ui/KeyHint';

const PERCENT = 100;
const TOPICS = [
  'basics',
  'draft',
  'moving',
  'cards',
  'board',
  'chance',
  'effects',
  'actions',
  'progression',
  'controls',
] as const;
type Topic = (typeof TOPICS)[number];

const EFFECTS: readonly EffectType[] = [
  'pixelate',
  'splatter',
  'double_trouble',
  'pace_slow',
  'pace_fast',
  'u_turn',
  'success_multiplier',
  'shield',
];

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-body text-ink-2">{children}</p>;
}

function Points({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex max-w-3xl flex-col gap-2 border-l-3 border-line-strong pl-5">
      {items.map((item) => (
        <li key={item} className="text-body text-ink-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Icon tile with name and description (effects, action cards). */
function Entry({
  icon,
  tone,
  name,
  description,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  tone: 'good' | 'bad';
  name: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-4 rounded-panel border border-line bg-panel px-4 py-3">
      <span className={tone === 'good' ? 'text-good' : 'text-bad'}>
        <Icon name={icon} size={24} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-chip font-semibold uppercase tracking-chip">{name}</span>
        <span className="text-body-sm text-ink-2">{description}</span>
      </span>
    </li>
  );
}

/** Player guide (game-design §7, §8–§15): the main mechanics, effects and action cards in short. */
export function HelpScreen() {
  const { t } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const settingsState = useUiStore((state) => state.settingsState);
  const config = useGameConfigStore((state) => state.config);
  const cards = useActionCardsStore((state) => state.cards);
  const loadCards = useActionCardsStore((state) => state.load);
  const [topic, setTopic] = useState<Topic>('basics');

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const { rules, draft, penalties } = effectiveGameConfig(config);
  const pauseHotkey = displayAccelerator(
    settingsState.status === 'ready' ? settingsState.settings.pauseHotkey : DEFAULT_SETTINGS.pauseHotkey,
  );
  // Freshen Up only exists in beta sessions (game-design §6.7)
  const playableCards = cards.filter(
    (card) => card.enabled && (rules.betaMode || card.type !== 'freshen_up'),
  );
  const actionList = (group: 'good' | 'bad') => (
    <ul className="grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
      {playableCards
        .filter((card) => actionGroup(card.type) === group)
        .map((card) => (
          <Entry
            key={card.id}
            icon={card.type}
            tone={group}
            name={actionCardName(t, cards, card.id, card.type)}
            description={actionCardDescription(t, cards, card.id, card.type)}
          />
        ))}
    </ul>
  );

  let content: ReactNode;
  switch (topic) {
    case 'basics':
      content = (
        <>
          <Paragraph>{t('help.basics.intro')}</Paragraph>
          <Points
            items={[
              t('help.basics.step1'),
              t('help.basics.step2'),
              t('help.basics.step3'),
              t('help.basics.step4'),
              t('help.basics.step5'),
            ]}
          />
          <Paragraph>{t('help.basics.tip')}</Paragraph>
        </>
      );
      break;
    case 'draft':
      content = (
        <>
          <Paragraph>
            {draft.enabled
              ? t('help.draft.intro', { picks: draft.picks, total: draft.fieldCount })
              : t('help.draft.off')}
          </Paragraph>
          {draft.enabled && (
            <Points
              items={DRAFT_FIELD_TYPES.filter((type) => draft.composition[type] > 0).map(
                (type) =>
                  `${t(`draft.type.${type}`)} (${draft.composition[type]}×): ${t(`help.draft.type.${type}`, {
                    splash: Math.round(draft.splashShare * PERCENT),
                    factor: draft.winMultiplier,
                  })}`,
              )}
            />
          )}
          <Paragraph>{t('help.draft.wheel', { minutes: penalties.lockoutMinutes })}</Paragraph>
        </>
      );
      break;
    case 'moving':
      content = (
        <Points
          items={[
            t('help.moving.roll'),
            t('help.moving.direction'),
            ...(rules.strokeTierMax > 1 ? [t('help.moving.tiers', { max: rules.strokeTierMax })] : []),
            ...(rules.forcedReversalChance > 0
              ? [t('help.moving.reversal', { percent: Math.round(rules.forcedReversalChance * PERCENT) })]
              : []),
            t('help.moving.preview'),
          ]}
        />
      );
      break;
    case 'cards':
      content = (
        <Points
          items={[
            t('help.cards.normal'),
            t('help.cards.action'),
            rules.collectiblesVisible ? t('help.cards.performerVisible') : t('help.cards.performer'),
            ...rules.collectibleTiers.map((tier) =>
              tier.bonus.type === 'convert_bad'
                ? t('help.cards.tierConvert', { collected: tier.collected, count: tier.bonus.count })
                : t('help.cards.tierChance', { collected: tier.collected, percent: tier.bonus.percent }),
            ),
            ...(rules.collectiblePixelateRelief > 0
              ? [t('help.cards.relief', { count: rules.collectiblePixelateRelief })]
              : []),
            t('help.cards.goal'),
          ]}
        />
      );
      break;
    case 'board':
      content = (
        <Points
          items={[
            t('help.board.detour', { count: rules.detourConversion }),
            rules.revisitChancePenalty > 0
              ? t('help.board.revisitPenalty', { penalty: rules.revisitChancePenalty })
              : t('help.board.revisit'),
            t('help.board.drift'),
          ]}
        />
      );
      break;
    case 'chance':
      content = (
        <>
          <Paragraph>
            {t('help.chance.intro', {
              rate: rules.chancePerDiscovered,
              min: rules.winChanceBounds[0],
              max: rules.winChanceBounds[1],
            })}
          </Paragraph>
          <Points
            items={[
              t('help.chance.plus'),
              ...(rules.revisitChancePenalty > 0
                ? [t('help.chance.minus', { penalty: rules.revisitChancePenalty })]
                : []),
              t('help.chance.wheel', { cap: rules.holdSecondsCap }),
              t('help.chance.denied'),
            ]}
          />
        </>
      );
      break;
    case 'effects':
      content = (
        <>
          <Paragraph>{t('help.effects.intro')}</Paragraph>
          <ul className="grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {EFFECTS.map((effect) => (
              <Entry
                key={effect}
                icon={EFFECT_ICONS[effect]}
                tone={GOOD_EFFECTS.includes(effect) ? 'good' : 'bad'}
                name={t(`effect.${effect}.name`)}
                description={t(`effect.${effect}.description`)}
              />
            ))}
          </ul>
        </>
      );
      break;
    case 'actions':
      content = (
        <>
          <Paragraph>
            {rules.actionRetrigger === 'once' ? t('help.actions.intro') : t('help.actions.introAlways')}
          </Paragraph>
          <h3 className="font-label text-label uppercase tracking-label text-good">
            {t('help.actions.good')}
          </h3>
          {actionList('good')}
          <h3 className="font-label text-label uppercase tracking-label text-bad">{t('help.actions.bad')}</h3>
          {actionList('bad')}
        </>
      );
      break;
    case 'progression':
      content = (
        <Points
          items={[
            t('help.progression.loss', { step: penalties.penaltyStep }),
            t('help.progression.decay', { count: penalties.decayAmount }),
            t('help.progression.success', {
              fields: penalties.successRemoveFields,
              percent: Math.round(penalties.goodChanceStep * PERCENT),
            }),
            t('help.progression.partial', { fields: penalties.partialRemoveFields }),
            t('help.progression.denied'),
          ]}
        />
      );
      break;
    case 'controls':
      content = (
        <ul className="flex max-w-3xl flex-col gap-3">
          {(
            [
              ['Space', t('help.controls.space')],
              ['← →', t('help.controls.arrows')],
              ['1–6', t('help.controls.numbers')],
              ['G', t('help.controls.gallery')],
              ['Ctrl + Backspace', t('help.controls.endEarly')],
              [pauseHotkey, t('help.controls.pause')],
              ['Esc', t('help.controls.escape')],
            ] as const
          ).map(([keys, text]) => (
            <li key={keys} className="flex items-center gap-4">
              <span className="w-44 shrink-0">
                <KeyHint keys={keys} />
              </span>
              <span className="text-body text-ink-2">{text}</span>
            </li>
          ))}
        </ul>
      );
      break;
  }

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
        <h1 className="font-display text-title font-bold uppercase">{t('help.title')}</h1>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={t('help.nav')}
          className="flex flex-col gap-1 border-r border-line bg-panel px-4 py-6"
        >
          {TOPICS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-current={entry === topic ? 'page' : undefined}
              onClick={() => {
                setTopic(entry);
              }}
              className={classNames(
                'rounded-panel px-4 py-2.5 text-left font-display text-chip font-semibold uppercase tracking-chip transition-colors duration-150',
                entry === topic ? 'bg-surface text-ink' : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
              )}
            >
              {t(`help.topic.${entry}`)}
            </button>
          ))}
        </nav>
        <section className="flex min-h-0 flex-col gap-6 overflow-y-auto px-12 py-8">
          <h2 className="font-display text-title font-bold uppercase">{t(`help.topic.${topic}`)}</h2>
          {content}
        </section>
      </div>
    </main>
  );
}
