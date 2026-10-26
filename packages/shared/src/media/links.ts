/**
 * Publication links: a link is an https link of its platform's own host, with no user
 * info and no port, so a link on a beneficiary's profile always opens the platform it names. A
 * YouTube link gives its video id, from which alone the thumbnail address is built.
 */

/** The hosts a platform's consent channel publishes on; a channel not listed takes any host. */
const HOSTS = new Map<string, readonly string[]>([
  ['facebook', ['facebook.com', 'fb.watch', 'fb.com']],
  ['video', ['youtube.com', 'youtu.be']],
]);

export const LINK_MAX = 500;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The host is the name itself or a subdomain of it (www., m.), never a look-alike. */
const onHost = (hostname: string, host: string) =>
  hostname === host || hostname.endsWith(`.${host}`);

/** Why a link is refused, or null when it may be stored for a platform of this channel. */
export function linkProblem(link: string, channel: string): 'link_invalid' | 'link_host' | null {
  if (link.length > LINK_MAX) return 'link_invalid';
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return 'link_invalid';
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return 'link_invalid';
  const hosts = HOSTS.get(channel);
  if (hosts && !hosts.some((h) => onHost(url.hostname.toLowerCase(), h))) return 'link_host';
  return null;
}

/** The YouTube video id of a link, or null for any other link. */
export function youtubeId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (onHost(host, 'youtu.be')) id = url.pathname.split('/')[1] ?? null;
  else if (onHost(host, 'youtube.com')) {
    const [, first, second] = url.pathname.split('/');
    id =
      first === 'watch'
        ? url.searchParams.get('v')
        : first === 'shorts' || first === 'embed' || first === 'live'
          ? (second ?? null)
          : null;
  }
  return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

/** The thumbnail of a YouTube video, built from its id alone. */
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
