/**
 * Publication links: a link is an https link of its platform's own host, with no user
 * info and no port, so a link on a beneficiary's profile always opens the platform it names. A
 * YouTube link gives its video id, from which alone the thumbnail address is built. Written
 * without the `URL` class because this package has neither the DOM nor the Node types.
 */

/** The hosts of a platform kind; a kind not listed (other) takes any https host. */
const HOSTS = new Map<string, readonly string[]>([
  ['facebook', ['facebook.com', 'fb.watch', 'fb.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
]);

export const LINK_MAX = 500;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The host is the name itself or a subdomain of it (www., m.), never a look-alike. */
const onHost = (hostname: string, host: string) =>
  hostname === host || hostname.endsWith(`.${host}`);

/** Control characters (C0, DEL, C1) and the invisible width and direction marks. */
const isHidden = (code: number): boolean =>
  code < 0x20 ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0xfeff;

/**
 * The host, path and query of an https link whose authority is a plain host (no user name,
 * password or port) and whose text has no whitespace, backslash or hidden character; null for
 * anything else.
 */
function parse(link: string): { host: string; path: string; query: string } | null {
  if (/[\s\\]/.test(link) || [...link].some((c) => isHidden(c.charCodeAt(0)))) return null;
  // eslint-disable-next-line security/detect-unsafe-regex -- disjoint character classes, no nesting: linear
  const match = /^https:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(link);
  if (!match) return null;
  const host = match[1]!.toLowerCase();
  // eslint-disable-next-line security/detect-unsafe-regex -- each repetition starts with a dot: linear
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return null;
  return { host, path: match[2] ?? '', query: (match[3] ?? '').slice(1) };
}

/** Why a link is refused, or null when it may be stored for a platform of this kind. */
export function linkProblem(link: string, kind: string): 'link_invalid' | 'link_host' | null {
  if (link.length > LINK_MAX) return 'link_invalid';
  const url = parse(link);
  if (!url) return 'link_invalid';
  const hosts = HOSTS.get(kind);
  if (hosts && !hosts.some((h) => onHost(url.host, h))) return 'link_host';
  return null;
}

/** The value of one query parameter, as given. */
const queryValue = (query: string, name: string) =>
  query
    .split('&')
    .map((pair) => pair.split('='))
    .find(([key]) => key === name)?.[1] ?? null;

/** The YouTube video id of a link, or null for any other link. */
export function youtubeId(link: string): string | null {
  const url = parse(link);
  if (!url) return null;
  const [, first, second] = url.path.split('/');
  let id: string | null = null;
  if (onHost(url.host, 'youtu.be')) id = first ?? null;
  else if (onHost(url.host, 'youtube.com'))
    id =
      first === 'watch'
        ? queryValue(url.query, 'v')
        : first === 'shorts' || first === 'embed' || first === 'live'
          ? (second ?? null)
          : null;
  return id !== null && YOUTUBE_ID.test(id) ? id : null;
}

/** The thumbnail of a YouTube video, built from its id alone. */
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
