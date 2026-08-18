import { ConfigService } from '@nestjs/config';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import {
  buildSpeechRequest,
  FalAudioService,
  readDuration,
} from './fal-audio.service';

function service(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { FAL_KEY: 'k', ...overrides };
  return new FalAudioService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('FalAudioService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('пустой текст не отправляет в сеть вообще', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    await expect(service().speak('   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Провайдер берёт деньги и за неразобранный запрос — до сети доводить
    // нечего.
    expect(spy).not.toHaveBeenCalled();
  });

  it('отдаёт запись и её длину из таймингов', async () => {
    global.fetch = jest.fn(async (url: unknown) =>
      String(url).includes('fal.run')
        ? ok({
            audio: { url: 'https://cdn/voice.mp3' },
            timestamps: [{ end: 4.2 }, { end: 13.4 }],
          })
        : ({
            ok: true,
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
          } as unknown as Response),
    ) as unknown as typeof fetch;

    const spoken = await service().speak('Цитата');

    expect(spoken.seconds).toBe(13.4);
    expect(spoken.audio.length).toBe(3);
  });

  it('ошибку провайдера превращает в BadGateway', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    })) as unknown as typeof fetch;

    await expect(service().speak('Цитата')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('без ключа считает себя выключенным', () => {
    expect(service({ FAL_KEY: '' }).enabled).toBe(false);
    expect(service().enabled).toBe(true);
  });
});

describe('readDuration', () => {
  it('берёт конец последнего слова', () => {
    expect(readDuration([{ end: 2 }, { end: 9.5 }], 'текст')).toBe(9.5);
  });

  it('понимает и второе название поля', () => {
    expect(readDuration([{ end_time: 7 }], 'текст')).toBe(7);
  });

  it('без таймингов считает по длине текста', () => {
    // Занижать нельзя: по этому числу обрезается ролик, и речь оборвалась бы
    // на полуслове.
    expect(readDuration(undefined, 'а'.repeat(140))).toBe(10);
  });

  it('никогда не отдаёт ноль или отрицательное', () => {
    expect(readDuration([], '')).toBeGreaterThan(0);
    expect(readDuration([{ end: 0 }], 'к')).toBeGreaterThan(0);
  });
});

describe('buildSpeechRequest', () => {
  const base = { text: 'Цитата', voice: 'Rachel' };

  it('для multilingual v2 задаёт темп', () => {
    const request = buildSpeechRequest({
      ...base,
      model: 'fal-ai/elevenlabs/tts/multilingual-v2',
    });
    expect(request.speed).toBe(0.95);
  });

  it('для v3 темп не шлёт — эта модель его не принимает', () => {
    // Лишнее поле уходит в платный запрос; провайдер уже показывал, что берёт
    // деньги и за то, чего не смог разобрать.
    const request = buildSpeechRequest({
      ...base,
      model: 'fal-ai/elevenlabs/tts/eleven-v3',
    });
    expect(request.speed).toBeUndefined();
  });

  it('общие поля есть у обеих', () => {
    for (const model of [
      'fal-ai/elevenlabs/tts/multilingual-v2',
      'fal-ai/elevenlabs/tts/eleven-v3',
    ]) {
      const request = buildSpeechRequest({ ...base, model });
      expect(request.text).toBe('Цитата');
      expect(request.language_code).toBe('ru');
      expect(request.timestamps).toBe(true);
    }
  });
});
