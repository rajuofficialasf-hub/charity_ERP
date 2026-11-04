import { stateTone } from '../../features/applications/status';

/**
 * The tone of a state's badge on the office's pages: the one rule of `stateTone`, in the words of
 * the earlier set's badge, until those pages move to the asf chip.
 */
export function badgeToneOf(status: string) {
  const tone = stateTone(status);
  return tone === 'error' ? ('danger' as const) : tone;
}
