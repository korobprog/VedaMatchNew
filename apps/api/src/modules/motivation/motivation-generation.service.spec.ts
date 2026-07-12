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

  it('rejects decoded image data without a PNG signature', async () => {
    const config = { get: (key: string) => ({ MOTIVATION_AI_API_KEY: 'test', MOTIVATION_AI_BASE_URL: 'https://example.test/v1', MOTIVATION_IMAGE_CONTROLLER_MODEL: 'gpt-5.5' })[key] } as ConfigService;
    const service = new MotivationGenerationService(config);
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(`data: ${JSON.stringify({ type: 'image_generation_call', result: Buffer.alloc(1200).toString('base64') })}\n\n`, { status: 200 }));
    await expect(service.generateImage('test')).rejects.toThrow('valid PNG');
  });
});
