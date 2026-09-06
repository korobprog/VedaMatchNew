import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelMessage } from './assistant-conversation';
import {
  parseCompletion,
  resolveProviderConfig,
  type ParsedCompletion,
} from './assistant-provider';

/** Один запрос к модели не может висеть дольше: человек ждёт в чате. */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * OpenAI-совместимый провайдер (тот же релей, что у Вдохновения и Astro) с
 * function calling. Сетевой слой без логики: разбор ответа — в
 * `assistant-provider.ts`, где он покрыт тестом.
 */
@Injectable()
export class AssistantProviderService {
  private readonly logger = new Logger(AssistantProviderService.name);

  constructor(private readonly config: ConfigService) {}

  private settings() {
    return resolveProviderConfig({
      ASSISTANT_AI_BASE_URL: this.config.get<string>('ASSISTANT_AI_BASE_URL'),
      ASSISTANT_AI_API_KEY: this.config.get<string>('ASSISTANT_AI_API_KEY'),
      ASSISTANT_TEXT_MODEL: this.config.get<string>('ASSISTANT_TEXT_MODEL'),
      MOTIVATION_AI_BASE_URL: this.config.get<string>('MOTIVATION_AI_BASE_URL'),
      MOTIVATION_AI_API_KEY: this.config.get<string>('MOTIVATION_AI_API_KEY'),
      MOTIVATION_TEXT_MODEL: this.config.get<string>('MOTIVATION_TEXT_MODEL'),
    });
  }

  get configured(): boolean {
    return this.settings() !== null;
  }

  get model(): string | null {
    return this.settings()?.model ?? null;
  }

  /** Цены модели в центах за миллион токенов; нули — учёт денег выключен. */
  get rates(): { inCentsPerMtok: number; outCentsPerMtok: number } {
    return {
      inCentsPerMtok: Number(
        this.config.get<string>('ASSISTANT_AI_USD_CENTS_PER_MTOK_IN') ?? 0,
      ),
      outCentsPerMtok: Number(
        this.config.get<string>('ASSISTANT_AI_USD_CENTS_PER_MTOK_OUT') ?? 0,
      ),
    };
  }

  async complete(input: {
    messages: ModelMessage[];
    tools?: Array<Record<string, unknown>>;
    /** `none` — ответ словами без инструментов (последний круг). */
    toolChoice?: 'auto' | 'none';
    temperature?: number;
  }): Promise<ParsedCompletion> {
    const settings = this.settings();
    if (!settings)
      throw new ServiceUnavailableException('Ассистент не настроен');

    const body: Record<string, unknown> = {
      model: settings.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.4,
    };
    if (input.tools && input.tools.length > 0 && input.toolChoice !== 'none') {
      body.tools = input.tools;
      body.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${settings.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.warn(
        `Провайдер не ответил: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException('Провайдер не ответил вовремя');
    }
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300);
      this.logger.warn(`Ошибка провайдера ${response.status}: ${text}`);
      throw new BadGatewayException(`Ошибка провайдера ${response.status}`);
    }
    return parseCompletion(await response.json());
  }
}
