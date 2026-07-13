import { ConfigService } from '@nestjs/config';
import { MotivationGenerationService } from './motivation-generation.service';

describe('MotivationGenerationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects image models as controller models', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-image-1' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    await expect(service.generateImage('test')).rejects.toThrow('Responses-capable');
  });

  it('sends the provider-compatible chat and image request contract', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-5.5' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(1200)]).toString('base64');
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ru: { title: 'ru', text: 'ru', storyText: 'ru' }, en: { title: 'en', text: 'en', storyText: 'en' }, hi: { title: 'hi', text: 'hi', storyText: 'hi' } }) } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(`data: {"type":"response.output_item.done","item":{"type":"image_generation_call",\n` + `data: "result":"${png}"}}\n\ndata: [DONE]\n\n`, { status: 200 }));

    await service.generateCopy({ profileType: 'seeker', audienceTrack: 'universal', category: 'daily' });
    await expect(service.generateImage('test')).resolves.toEqual(Buffer.from(png, 'base64'));

    const chatOptions = fetchMock.mock.calls[0][1] as RequestInit;
    expect(chatOptions.headers).toMatchObject({ 'user-agent': 'OpenAI-Python/1.0' });
    expect(JSON.parse(String(chatOptions.body))).toMatchObject({ model: 'deepseek-v4-flash', stream: true });
    const imageOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(imageOptions.headers).toMatchObject({ 'user-agent': 'OpenAI-Python/1.0' });
    expect(JSON.parse(String(imageOptions.body))).toMatchObject({
      model: 'gpt-5.5',
      stream: true,
      store: false,
      tools: [{ type: 'image_generation', action: 'generate', output_format: 'png' }],
      tool_choice: { type: 'image_generation' },
    });
  });

  it('parses streamed chat completion content', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_TEXT_MODEL: 'gpt-5.5' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    const copy = JSON.stringify({ ru: { title: 'ru', text: 'ru', storyText: 'ru' }, en: { title: 'en', text: 'en', storyText: 'en' }, hi: { title: 'hi', text: 'hi', storyText: 'hi' } });
    const midpoint = Math.floor(copy.length / 2);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: copy.slice(0, midpoint) } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: copy.slice(midpoint) } }] })}\n\n` +
      'data: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    await expect(service.generateCopy({ profileType: 'seeker', audienceTrack: 'universal', category: 'daily' })).resolves.toHaveLength(3);
  });

  it('requests strict sourced-quote copy without invoking image generation', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_TEXT_MODEL: 'gpt-5.5' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    const payload = { originalText: 'Exact quote', profileTypes: ['user'], explanation: 'A sufficiently detailed explanation of the exact quote.', translations: {} };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(payload) } }] })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    await expect(service.generateVerifiedQuoteCopy({
      originalText: 'Exact quote', originalLanguage: 'en', author: 'Author', work: 'Work', locator: '1', contextExcerpt: 'Exact quote in context',
    })).resolves.toMatchObject({ originalText: 'Exact quote' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ model: 'gpt-5.5', response_format: { type: 'json_object' }, stream: true });
    expect(body.messages[0].content).toContain('Never alter originalText');
    expect(body.messages[0].content).toContain('user, in_goodness, yogi, devotee');
  });

  it('rejects decoded image data without a PNG signature', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-5.5' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(`data: ${JSON.stringify({ type: 'image_generation_call', result: Buffer.alloc(1200).toString('base64') })}\n\n`, { status: 200 }));
    await expect(service.generateImage('test')).rejects.toThrow('valid PNG');
  });

  it('aborts when the image response stream does not finish', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-5.5', MOTIVATION_IMAGE_TIMEOUT_MS: '20' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n')); } });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));

    await expect(service.generateImage('test')).rejects.toThrow('timed out');
  });
});
