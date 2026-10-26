import { describe, expect, it } from 'vitest';
import { linkProblem, youtubeId, youtubeThumbnail } from './links';

describe('a publication link', () => {
  it('takes an https link of the platform its channel publishes on', () => {
    expect(linkProblem('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video')).toBeNull();
    expect(linkProblem('https://youtu.be/dQw4w9WgXcQ', 'video')).toBeNull();
    expect(
      linkProblem('https://m.facebook.com/AsSunnahFoundation/videos/1', 'facebook'),
    ).toBeNull();
    expect(linkProblem('https://fb.watch/abc123/', 'facebook')).toBeNull();
  });

  it('refuses another platform, a look-alike host, user info, a port and a non-https link', () => {
    expect(linkProblem('https://www.facebook.com/v/1', 'video')).toBe('link_host');
    expect(linkProblem('https://facebook.com.evil.example/v', 'facebook')).toBe('link_host');
    expect(linkProblem('https://evilfacebook.com/v', 'facebook')).toBe('link_host');
    expect(linkProblem('https://youtube.com@evil.example/', 'video')).toBe('link_invalid');
    expect(linkProblem('https://youtube.com:8443/watch?v=dQw4w9WgXcQ', 'video')).toBe(
      'link_invalid',
    );
    expect(linkProblem('http://youtube.com/watch?v=dQw4w9WgXcQ', 'video')).toBe('link_invalid');
    expect(linkProblem('javascript:alert(1)', 'video')).toBe('link_invalid');
    expect(linkProblem('not a link', 'video')).toBe('link_invalid');
    expect(linkProblem(`https://youtu.be/${'a'.repeat(500)}`, 'video')).toBe('link_invalid');
  });

  it('takes any https host for a channel without a platform host of its own', () => {
    expect(linkProblem('https://assunnahfoundation.org/stories/1', 'website')).toBeNull();
    expect(linkProblem('http://assunnahfoundation.org/stories/1', 'website')).toBe('link_invalid');
  });
});

describe('a YouTube video id', () => {
  it('comes from every YouTube link form', () => {
    for (const link of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ])
      expect(youtubeId(link), link).toBe('dQw4w9WgXcQ');
  });

  it('is null for another host, a bad id and a link with user info', () => {
    expect(youtubeId('https://facebook.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('https://youtu.be/short')).toBeNull();
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ%2F..%2F')).toBeNull();
    expect(youtubeId('https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('https://www.youtube.com/channel/dQw4w9WgXcQ')).toBeNull();
  });

  it('builds the thumbnail address from the id alone', () => {
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });
});
