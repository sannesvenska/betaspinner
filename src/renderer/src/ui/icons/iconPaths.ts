import type { ActionId } from '@shared/actions';

/** 24×24 stroke icons (1.5px, round caps/joins, no fills) – Darkroom icon sheet v0.2. */
export const ACTION_ICON_PATHS: Readonly<Record<ActionId, string>> = {
  clearing_edges: 'M8 3h8M8 21h8M9 3v3c0 3 6 3 6 6s-6 3-6 6v3M15 3v3c0 3-6 3-6 6s6 3 6 6v3',
  good_fairy:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  decision_maker: 'M5 5h14v14H5zM9.5 10a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5v.01',
  cleaning_lady: 'M4 20h16M6 16l8-8 4 4-8 8zM14 8l2-2 4 4-2 2',
  hail_mary: 'M4 17l6-6 4 4 6-8M15 7h5v5',
  switcheroo: 'M4 8h14l-3-3M20 16H6l3 3',
  redemption: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  pixelate: 'M4 4h5v5H4zM15 4h5v5h-5zM9.5 9.5h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z',
  splatter: 'M12 5c2 3 6 3 6 7s-3 4-3 7-3 1-4-1-5-2-5-5 3-5 4-6 2-2 2-2zM5 5v.01M20 20v.01M20 6v.01',
  squeeze_task: 'M3 12h6M6 9l3 3-3 3M21 12h-6M18 9l-3 3 3 3M12 5v14',
  edge_and_hold: 'M5 13a7 7 0 1 0 14 0a7 7 0 1 0-14 0M12 9v4l2.5 2M10 2h4',
  double_trouble: 'M4 8h10v10H4zM10 4h10v10',
  mistress_says_no: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M5.6 5.6l12.8 12.8',
  guessing_game: 'M3 10h9v9H3zM13 6l6-2 2 8-6 2M6.5 13.5v.01M8.5 15.5v.01',
  goal_teleport: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M18 3l3 3-3 3',
  u_turn: 'M8 20V9a4 4 0 0 1 8 0v4M13 10l3 3 3-3',
  moving_day: 'M3 18c3-10 15-10 18 0M18 15l3 3 1-4',
  highperformer: 'M13 3L5 14h6l-1 7 8-11h-6z',
  bad_luck: 'M4 17l6-6 4 4 6-8M3 3l18 18',
  take_it_slow: 'M4 17a8 8 0 0 1 16 0M12 17l-4-4',
  speed_it_up: 'M4 17a8 8 0 0 1 16 0M12 17l4-5',
};

export const UI_ICON_PATHS = {
  goal: 'M5 21V4M5 5h12l-2.5 4 2.5 4H5',
  star: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  reverse: 'M9 5L4 10l5 5M4 10h11a5 5 0 0 1 0 10h-3',
  shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
  gallery: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  soundOn: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  soundOff: 'M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6',
  pause: 'M8 5v14M16 5v14',
  check: 'M4 12l5 5L20 6',
  brokenImage: 'M4 4h16v16H4zM4 15l4-4 3 3M14 11l2-2 4 4M3 3l18 18',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  folder: 'M3 6h6l2 2h10v11H3z',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 5v3h3M4 13a8 8 0 0 0 14.9 3M20 19v-3h-3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
} as const;

export type UiIconName = keyof typeof UI_ICON_PATHS;
