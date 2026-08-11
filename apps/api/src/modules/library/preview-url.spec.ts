import { resolvePreviewUrl, youtubePreviewUrl } from './preview-url';

describe('youtubePreviewUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=OXDrvBwIHLg',
    'https://youtu.be/OXDrvBwIHLg',
    'https://www.youtube.com/shorts/OXDrvBwIHLg',
    'https://m.youtube.com/watch?v=OXDrvBwIHLg&t=30s',
  ])('builds a thumbnail for %s', (url) => {
    expect(youtubePreviewUrl(url)).toBe(
      'https://i.ytimg.com/vi/OXDrvBwIHLg/hqdefault.jpg',
    );
  });

  it('returns null for a non-video youtube page', () => {
    expect(youtubePreviewUrl('https://www.youtube.com/@channel')).toBeNull();
  });

  it('returns null for other domains', () => {
    expect(youtubePreviewUrl('https://example.com/watch?v=abc')).toBeNull();
  });
});

describe('resolvePreviewUrl', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('takes the rutube thumbnail from oEmbed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          thumbnail_url: 'https://pic.rutube.ru/video/cover.jpg',
        }),
    }) as never;

    await expect(
      resolvePreviewUrl('https://rutube.ru/video/abc123/'),
    ).resolves.toBe('https://pic.rutube.ru/video/cover.jpg');
  });

  it('ignores a thumbnail hosted outside rutube', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ thumbnail_url: 'https://evil.example/cover.jpg' }),
    }) as never;

    await expect(
      resolvePreviewUrl('https://rutube.ru/video/abc123/'),
    ).resolves.toBeNull();
  });

  it('survives an oEmbed failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as never;

    await expect(
      resolvePreviewUrl('https://rutube.ru/video/abc123/'),
    ).resolves.toBeNull();
  });

  it('does not call the network for unknown hosts', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(
      resolvePreviewUrl('https://example.com/a'),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
