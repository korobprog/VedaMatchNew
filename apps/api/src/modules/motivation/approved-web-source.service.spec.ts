import { ApprovedWebSourceService } from './approved-web-source.service';

describe('ApprovedWebSourceService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('searches Wikiquote and returns extracted text with attribution', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        query: { search: [{ title: 'Albert Einstein', snippet: 'This snippet must never be saved.', pageid: 42 }] },
      }), { status: 200, headers: { 'content-length': '140' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        parse: { title: 'Albert Einstein', pageid: 42, wikitext: { '*': "Intro\n* Life is like riding a bicycle. To keep your balance, you must keep moving.\n** Secondary attribution\n[[Category:People]]" } },
      }), { status: 200, headers: { 'content-length': '240' } }));
    const service = new ApprovedWebSourceService();

    const candidates = await service.search('life', 1);
    expect(candidates).toEqual([expect.objectContaining({
      originalText: 'Life is like riding a bicycle. To keep your balance, you must keep moving.',
      author: 'Albert Einstein',
      sourceUrl: expect.stringContaining('wikiquote.org'),
    })]);
    expect(JSON.stringify(candidates)).not.toContain('snippet must never');
    expect(String((fetch as jest.Mock).mock.calls[0][0])).toContain('action=query');
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      headers: { 'User-Agent': 'VedaMatch-Motivation/1.0' },
    }));
  });

  it('rejects redirects to a non-approved hostname', async () => {
    const response = new Response('{}');
    Object.defineProperty(response, 'url', { value: 'https://evil.example/result' });
    jest.spyOn(global, 'fetch').mockResolvedValue(response);
    const service = new ApprovedWebSourceService();

    await expect(service.search('life', 1)).rejects.toThrow('Source domain is not approved');
  });
});
