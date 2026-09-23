import { Injectable } from '@nestjs/common';
import { readCheckSettings } from './check-budget';
import {
  buildCheckRequest,
  isProviderBusy,
  parseCheckResponse,
  type CheckInput,
  type ParsedCheckResponse,
} from './check-request';

/**
 * Провайдер не ответил. `busy` — он занят (429, перегрузка): такую попытку
 * воркер не засчитывает карточке.
 */
export class CheckProviderError extends Error {
  constructor(
    message: string,
    readonly busy: boolean,
  ) {
    super(message);
  }
}

/** Поиск с открытием страниц идёт дольше обычного ответа. */
const CHECK_TIMEOUT_MS = 150_000;

/**
 * Вызов ИИ с поиском в интернете (VED-384). Сборка запроса и разбор ответа —
 * `check-request.ts`; здесь только сеть.
 *
 * Адрес и ключ — те же, что у распознавания снимка
 * (`wellness-recognize.service.ts`): собственные переменные сервиса, затем
 * общие ассистентские, затем мотивационные. Копия, а не импорт: контракт
 * модуля запрещает брать хелперы чужого сервиса.
 */
@Injectable()
export class WellnessAiCheckService {
  private provider(): { baseUrl: string; apiKey: string } | null {
    const env = process.env;
    const baseUrl = (
      env.WELLNESS_AI_BASE_URL ||
      env.ASSISTANT_AI_BASE_URL ||
      env.MOTIVATION_AI_BASE_URL ||
      ''
    ).replace(/\/$/, '');
    const apiKey =
      env.WELLNESS_AI_API_KEY ||
      env.ASSISTANT_AI_API_KEY ||
      env.MOTIVATION_AI_API_KEY ||
      '';
    return baseUrl && apiKey ? { baseUrl, apiKey } : null;
  }

  get configured(): boolean {
    return this.provider() !== null;
  }

  get model(): string {
    return readCheckSettings(process.env).model;
  }

  async check(input: CheckInput): Promise<ParsedCheckResponse> {
    const provider = this.provider();
    if (!provider) throw new CheckProviderError('not_configured', false);

    let response: Response;
    try {
      response = await fetch(`${provider.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(buildCheckRequest(this.model, input)),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CheckProviderError(
        `provider_unreachable: ${String(error).slice(0, 150)}`,
        false,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new CheckProviderError(
        `provider_${response.status}: ${text.slice(0, 150)}`,
        isProviderBusy(response.status, text),
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new CheckProviderError('provider_invalid_json', false);
    }
    // Релей отвечает 200 и на перегрузку — с объектом `error` в теле.
    const error = (payload as { error?: unknown } | null)?.error;
    if (error && typeof error === 'object') {
      const message = JSON.stringify(error).slice(0, 150);
      throw new CheckProviderError(
        `provider_error: ${message}`,
        isProviderBusy(200, message),
      );
    }
    return parseCheckResponse(payload);
  }
}
