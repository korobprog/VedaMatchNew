import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ASTRO_SECTION_TITLES,
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
  type AstroSection,
  type GunaMilanScore,
  type VedicChart,
} from '@vedamatch/shared';

/**
 * Генерация текста разбора. По образцу MotivationGenerationService: тот же
 * OpenAI-совместимый эндпоинт, свои переменные окружения.
 */

/**
 * Входит в ключ кэша. Любая правка промпта обязана поднимать версию — иначе
 * пользователи будут видеть тексты, собранные по старым правилам, и понять это по
 * содержимому невозможно.
 */
export const ASTRO_PROMPT_VERSION = 'v1';

export interface GeneratedReading {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

const SECTION_BRIEFS: Readonly<Record<AstroSection, string>> = {
  overview: 'Общая картина карты: что в ней выделяется в первую очередь.',
  lagna: 'Лагна и её владыка: склад характера и способ действовать.',
  moon_nakshatra: 'Накшатра Луны: внутренний строй, чувства, потребности ума.',
  dasha_current:
    'Текущая махадаша и антардаша: на чём сейчас сосредоточена жизнь.',
  career: 'Десятый дом и его связи: дело, призвание, отношение к труду.',
  relationships:
    'Седьмой дом и его связи: как человек строит близкие отношения.',
  strengths: 'Сильные стороны карты и на что в ней можно опереться.',
  practice: 'Духовная практика: что поддерживает человека на этом пути.',
};

@Injectable()
export class AstroGenerationService {
  constructor(private readonly config: ConfigService) {}

  async generate(
    section: AstroSection,
    chart: VedicChart,
    locale = 'ru',
  ): Promise<GeneratedReading> {
    return this.complete(systemPrompt(locale), userPrompt(section, chart));
  }

  /**
   * Разбор совместимости. В промпт уходит только разбивка гуна-милана — числа
   * и короткие пояснения, без карт, времени и мест рождения, без имён обеих
   * сторон. Модель не может узнать о людях больше, чем уже видно из очков.
   */
  async generateCompatibility(
    score: GunaMilanScore,
    locale = 'ru',
  ): Promise<GeneratedReading> {
    return this.complete(
      compatibilitySystemPrompt(locale),
      compatibilityUserPrompt(score),
    );
  }

  /**
   * Фраза дня по бхаве транзитной Луны. Единственный вход — номер дома, 1..12:
   * ни знака, ни карты, ни человека модель не видит, поэтому текст безопасно
   * шарить между всеми пользователями с одинаковой бхавой в этот день.
   */
  async generateTransitPhrase(
    bhava: number,
    locale = 'ru',
  ): Promise<GeneratedReading> {
    return this.complete(transitSystemPrompt(locale), transitUserPrompt(bhava));
  }

  private async complete(
    system: string,
    user: string,
  ): Promise<GeneratedReading> {
    const apiKey = this.config.get<string>('ASTRO_AI_API_KEY');
    const baseUrl = this.config
      .get<string>('ASTRO_AI_BASE_URL')
      ?.replace(/\/$/, '');
    const model =
      this.config.get<string>('ASTRO_TEXT_MODEL') || 'deepseek-v4-flash';
    if (!apiKey || !baseUrl) {
      throw new ServiceUnavailableException('Astro AI не настроен');
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `Ошибка провайдера ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new BadGatewayException('Провайдер вернул пустой ответ');
    }

    return {
      text: extractText(content),
      model,
      tokensIn: payload.usage?.prompt_tokens ?? 0,
      tokensOut: payload.usage?.completion_tokens ?? 0,
    };
  }
}

function extractText(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    if (typeof parsed.text === 'string' && parsed.text.trim()) {
      return parsed.text.trim();
    }
  } catch {
    // Модель иногда игнорирует json_object и отвечает простым текстом. Это не
    // повод терять готовый ответ — но и не повод молча принимать что угодно ниже.
  }
  const fallback = content.trim();
  if (!fallback) throw new BadGatewayException('Пустой текст разбора');
  return fallback;
}

/**
 * Границы модели. Первое правило — главное: расчёт уже сделан детерминированно,
 * и модель не имеет права его трогать. Выдуманный градус или накшатра ловятся
 * пользователями мгновенно и стоят сервису доверия целиком.
 */
function systemPrompt(locale: string): string {
  return [
    'Ты помощник по ведической астрологии (джйотиш) в сервисе VedaMatch.',
    'Тебе передан ГОТОВЫЙ расчёт карты в JSON. Он верен и окончателен.',
    'Категорически запрещено: пересчитывать, уточнять, дополнять или изменять любые',
    'градусы, знаки, накшатры, бхавы и даты периодов. Не упоминай положений, которых',
    'нет во входных данных. Твоя работа — только истолковать переданное.',
    'Запрещено предсказывать смерть, болезни и исходы судебных дел, давать медицинские,',
    'юридические и финансовые рекомендации.',
    'Тон уважительный, вайшнавский, несектантский. Подчёркивай свободу воли и практику,',
    'а не предопределённость: карта описывает склонности, а не приговор.',
    `Язык ответа: ${locale}.`,
    'Ответ строго в JSON вида {"text": "..."}, 2–4 коротких абзаца, без заголовков.',
  ].join(' ');
}

/** Карта подаётся в читаемом виде: так модель реже путает поля, чем в сыром JSON. */
function userPrompt(section: AstroSection, chart: VedicChart): string {
  const lines: string[] = [];

  lines.push(`Раздел: ${ASTRO_SECTION_TITLES[section]}.`);
  lines.push(SECTION_BRIEFS[section]);
  lines.push('');
  lines.push(`Аянамша: Лахири ${chart.ayanamsa.toFixed(4)}°.`);

  if (chart.lagna) {
    lines.push(
      `Лагна: ${RASHI_NAMES[chart.lagna.rashi - 1]} ` +
        `${(chart.lagna.longitude % 30).toFixed(2)}°, накшатра ` +
        `${NAKSHATRA_NAMES[chart.lagna.nakshatra - 1]}, пада ${chart.lagna.pada}.`,
    );
  } else {
    lines.push(
      'Время рождения неизвестно: лагны и бхав нет. Не упоминай дома, ' +
        'асцендент и периоды — их в расчёте не существует.',
    );
  }

  lines.push('', 'Положения грах:');
  for (const graha of chart.grahas) {
    const parts = [
      `${GRAHA_NAMES[graha.graha]}: ${RASHI_NAMES[graha.rashi - 1]}`,
      `${graha.degreeInRashi.toFixed(2)}°`,
      `накшатра ${NAKSHATRA_NAMES[graha.nakshatra - 1]} пада ${graha.pada}`,
      `навамша ${RASHI_NAMES[graha.navamsaRashi - 1]}`,
    ];
    if (graha.bhava !== null) parts.push(`бхава ${graha.bhava}`);
    if (graha.retrograde) parts.push('ретроградна');
    if (graha.combust) parts.push('сожжена');
    lines.push(`- ${parts.join(', ')}`);
  }

  if (chart.dasha) {
    lines.push(
      '',
      `Текущая махадаша: ${GRAHA_NAMES[chart.dasha.currentMahadasha.lord]} ` +
        `(${chart.dasha.currentMahadasha.startsAt.slice(0, 10)} — ` +
        `${chart.dasha.currentMahadasha.endsAt.slice(0, 10)}).`,
      `Текущая антардаша: ${GRAHA_NAMES[chart.dasha.currentAntardasha.lord]} ` +
        `(${chart.dasha.currentAntardasha.startsAt.slice(0, 10)} — ` +
        `${chart.dasha.currentAntardasha.endsAt.slice(0, 10)}).`,
    );
  }

  return lines.join('\n');
}

function compatibilitySystemPrompt(locale: string): string {
  return [
    'Ты помощник по ведической астрологии (джйотиш) в сервисе знакомств VedaMatch.',
    'Тебе передан ГОТОВЫЙ результат гуна-милана — расчёта совместимости по Луне —',
    'в виде очков по восьми критериям. Он верен и окончателен: не пересчитывай очки,',
    'не выдумывай знаки, накшатры или другие детали карт, которых нет во входных',
    'данных. Твоя работа — истолковать переданные числа человеческим языком.',
    'Не давай прогнозов на будущее пары и не предсказывай исход отношений — только',
    'мягкое описание того, что означает этот баланс критериев.',
    'Запрещено обесценивать человека из-за низкого балла: подчёркивай, что гуна-милан',
    'описывает один срез совместимости, а не приговор, и что решение всегда за людьми.',
    'Тон уважительный, вайшнавский, несектантский.',
    `Язык ответа: ${locale}.`,
    'Ответ строго в JSON вида {"text": "..."}, 2–3 коротких абзаца, без заголовков.',
  ].join(' ');
}

function compatibilityUserPrompt(score: GunaMilanScore): string {
  const lines = [
    `Итог: ${score.totalPoints} из ${score.maxPoints} (${score.percent}%).`,
    '',
    'По критериям:',
  ];
  for (const koota of score.kootas) {
    lines.push(
      `- ${koota.title}: ${koota.points} из ${koota.maxPoints}. ${koota.note}.`,
    );
  }
  return lines.join('\n');
}

/** Традиционные значения бхав — то немногое, чего достаточно для фразы дня. */
const BHAVA_MEANINGS: Readonly<Record<number, string>> = {
  1: 'тело, самоощущение, то, как человек начинает дела',
  2: 'ресурсы, речь, семья, накопленное',
  3: 'усилие, смелость, короткие поездки, братья и сёстры',
  4: 'дом, внутренний покой, мать, корни',
  5: 'творчество, дети, интеллект, прежние заслуги',
  6: 'преодоление трудностей, здоровье, служение, конкуренция',
  7: 'партнёрство, брак, открытые договорённости',
  8: 'скрытое, перемены, то, что требует глубины',
  9: 'убеждения, учителя, дальние путешествия, удача',
  10: 'дело, положение в обществе, ответственность',
  11: 'приобретения, круг единомышленников, надежды',
  12: 'уединение, завершение, отпускание, духовная практика',
};

function transitSystemPrompt(locale: string): string {
  return [
    'Ты помощник по ведической астрологии (джйотиш) в сервисе VedaMatch.',
    'Тебе передан только номер дома (бхавы), который сегодня проходит транзитная Луна.',
    'Никакой другой информации о человеке у тебя нет и быть не может — не выдумывай',
    'знак, карту, имя или обстоятельства. Опиши общее настроение дня для этого дома,',
    'коротко и практично: на что естественно обратить внимание сегодня.',
    'Не давай предсказаний и не утверждай, что именно произойдёт — только тон дня.',
    'Тон уважительный, вайшнавский, несектантский.',
    `Язык ответа: ${locale}.`,
    'Ответ строго в JSON вида {"text": "..."}, 1 короткий абзац, 2–3 предложения.',
  ].join(' ');
}

function transitUserPrompt(bhava: number): string {
  return `Сегодня транзитная Луна проходит ${bhava}-й дом. Его значения: ${BHAVA_MEANINGS[bhava]}.`;
}
