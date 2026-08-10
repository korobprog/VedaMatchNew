import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { VedicChart } from '@vedamatch/shared';
import { AstroGenerationService } from './astro-generation.service';

const chart = {
  bornAtUtc: '1987-05-12T02:20:00.000Z',
  timeAccuracy: 'exact',
  ayanamsa: 23.669,
  lagna: { longitude: 46.19, rashi: 2, nakshatra: 4, pada: 1 },
  grahas: [
    {
      graha: 'sun',
      longitude: 27.17,
      degreeInRashi: 27.17,
      rashi: 1,
      nakshatra: 3,
      pada: 1,
      navamsaRashi: 9,
      bhava: 12,
      retrograde: false,
      combust: false,
    },
    {
      graha: 'saturn',
      longitude: 236.13,
      degreeInRashi: 26.13,
      rashi: 8,
      nakshatra: 18,
      pada: 3,
      navamsaRashi: 11,
      bhava: 7,
      retrograde: true,
      combust: false,
    },
  ],
  moonNakshatra: 15,
  dasha: {
    mahadashas: [],
    antardashas: [],
    currentMahadasha: {
      lord: 'saturn',
      startsAt: '2019-04-29T00:00:00.000Z',
      endsAt: '2038-04-29T00:00:00.000Z',
    },
    currentAntardasha: {
      lord: 'venus',
      startsAt: '2026-02-18T00:00:00.000Z',
      endsAt: '2029-04-20T00:00:00.000Z',
    },
  },
  fingerprint: 'fp',
  engineVersion: 'test',
} as unknown as VedicChart;

const configured = {
  get: (key: string) =>
    ({
      ASTRO_AI_API_KEY: 'test-key',
      ASTRO_AI_BASE_URL: 'https://provider.test/v1',
      ASTRO_TEXT_MODEL: 'test-model',
    })[key],
} as unknown as ConfigService;

const okResponse = (content: string, usage = {}) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 900, completion_tokens: 300, ...usage },
      }),
  } as unknown as Response);

describe('AstroGenerationService', () => {
  const service = new AstroGenerationService(configured);
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const sentBody = () => {
    // jest.SpyInstance теряет типы аргументов fetch, поэтому форма вызова
    // объявляется здесь явно — иначе доступ к телу запроса идёт через any.
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    return JSON.parse(calls[0][1].body as string) as {
      messages: { role: string; content: string }[];
      model: string;
    };
  };

  it('без настроек провайдера не делает запрос', async () => {
    const bare = new AstroGenerationService({
      get: () => undefined,
    } as unknown as ConfigService);
    await expect(bare.generate('overview', chart)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('возвращает текст и фактический расход токенов', async () => {
    fetchMock.mockReturnValue(okResponse('{"text":"Разбор карты"}'));

    await expect(service.generate('overview', chart)).resolves.toEqual({
      text: 'Разбор карты',
      model: 'test-model',
      tokensIn: 900,
      tokensOut: 300,
    });
  });

  it('принимает простой текст, когда модель проигнорировала JSON-режим', async () => {
    fetchMock.mockReturnValue(okResponse('Просто текст без обёртки'));
    const result = await service.generate('overview', chart);
    expect(result.text).toBe('Просто текст без обёртки');
  });

  it('пустой ответ считается ошибкой провайдера', async () => {
    fetchMock.mockReturnValue(okResponse('   '));
    await expect(service.generate('overview', chart)).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('ошибка провайдера не превращается в разбор', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('upstream down'),
    });
    await expect(service.generate('overview', chart)).rejects.toThrow(
      BadGatewayException,
    );
  });

  describe('промпт', () => {
    beforeEach(() => fetchMock.mockReturnValue(okResponse('{"text":"ок"}')));

    it('запрещает модели пересчитывать карту', async () => {
      await service.generate('overview', chart);
      const system = sentBody().messages[0].content;
      expect(system).toMatch(/запрещено/i);
      expect(system).toMatch(/пересчитывать/i);
    });

    it('запрещает предсказания смерти и медицинские советы', async () => {
      await service.generate('overview', chart);
      const system = sentBody().messages[0].content;
      expect(system).toMatch(/смерть|смерти/i);
      expect(system).toMatch(/медицинск/i);
    });

    it('передаёт положения грах готовыми, а не просит их вычислить', async () => {
      await service.generate('overview', chart);
      const user = sentBody().messages[1].content;
      expect(user).toContain('Сурья');
      expect(user).toContain('Меша');
      expect(user).toContain('бхава 12');
      expect(user).toContain('ретроградна');
    });

    it('передаёт текущие периоды, когда они есть', async () => {
      await service.generate('dasha_current', chart);
      const user = sentBody().messages[1].content;
      expect(user).toContain('Шани');
      expect(user).toContain('2019-04-29');
    });

    it('при неизвестном времени прямо запрещает упоминать дома и лагну', async () => {
      await service.generate('overview', {
        ...chart,
        timeAccuracy: 'unknown',
        lagna: null,
        dasha: null,
        grahas: chart.grahas.map((g) => ({ ...g, bhava: null })),
      });

      const user = sentBody().messages[1].content;
      expect(user).toMatch(/Время рождения неизвестно/);
      expect(user).toMatch(/Не упоминай дома/);
      expect(user).not.toContain('бхава');
    });
  });
});
