/** Which trades the Work on deck reads (Real / Backtest / All), remembered in a cookie the server page reads. */
export const WORK_SRC_COOKIE = 'work-src';
export function rememberWorkSource(v: string) {
  document.cookie = `${WORK_SRC_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
}
