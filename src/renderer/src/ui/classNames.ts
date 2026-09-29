/** Joins truthy class names. */
export const classNames = (...names: (string | false | null | undefined)[]): string =>
  names.filter(Boolean).join(' ');
