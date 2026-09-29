/** Error-as-value wrapper used across the IPC boundary (exceptions don't survive IPC cleanly). */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = <T = never>(error: unknown): Result<T> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
});
