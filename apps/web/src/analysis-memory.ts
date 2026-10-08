/*
 * The arithmetic behind Settings → Analysis on your Mac. It mirrors the analyzer
 * (services/analyzer/src/synamp_analyzer/pipeline.py and allowance.py) so the
 * numbers on screen are what the Mac will actually do.
 */

export const PER_SONG_GB = 3;
/** The same arithmetic as the analyzer, so the numbers here match what the Mac does. */
export const recommended = (total: number) => Math.floor(Math.max(PER_SONG_GB, Math.min(12, total * 0.25)));
export const recommendedMore = (total: number) => Math.floor(Math.max(PER_SONG_GB, Math.min(total - 8, total * 0.5)));
export const ceiling = (total: number) => Math.max(PER_SONG_GB, Math.floor(total - 4));
export const songsFor = (gb: number, total: number, cores: number) =>
  Math.max(1, Math.min(16, cores - 2, Math.floor(Math.min(gb, ceiling(total)) / PER_SONG_GB)));
