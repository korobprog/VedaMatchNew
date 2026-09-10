import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { buildLabelRequest, parseLabelResponse } from './label-recognition';

/**
 * Чтение состава со снимка этикетки.
 *
 * Настройки провайдера читаются из переменных окружения прямо здесь: контракт
 * сервисного модуля запрещает импортировать хелперы чужого сервиса, поэтому
 * разбор env дублируется, а не берётся из «Ассистента». Порядок тот же:
 * собственные переменные сервиса, затем общие ассистентские, затем
 * мотивационные — иначе сервису пришлось бы заводить свой ключ ради того же
 * самого провайдера.
 */
@Injectable()
export class WellnessRecognizeService {
  private readonly log = new Logger(WellnessRecognizeService.name);

  private config(): { baseUrl: string; apiKey: string; model: string } | null {
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
    if (!baseUrl || !apiKey) return null;
    // Литерал — крайний случай и он неизбежно устаревает: у релея модели
    // приходят и уходят, а `gpt-5.4-mini` на нём уже молчит. Настоящее
    // значение всегда приходит из окружения, и именно его надо править.
    // Модель обязана уметь читать картинки, а не только текст.
    const model =
      env.WELLNESS_VISION_MODEL ||
      env.ASSISTANT_TEXT_MODEL ||
      env.MOTIVATION_TEXT_MODEL ||
      'gpt-5.4';
    return { baseUrl, apiKey, model };
  }

  /** Пустая строка — законный ответ: состава на снимке не видно. */
  async readLabel(imageDataUrl: string): Promise<string> {
    const settings = this.config();
    if (!settings) {
      throw new ServiceUnavailableException(
        'Распознавание снимков не настроено — введите состав вручную',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(buildLabelRequest(settings.model, imageDataUrl)),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      this.log.warn(`Провайдер недоступен: ${String(error)}`);
      throw new ServiceUnavailableException(
        'Не удалось прочитать снимок — попробуйте ещё раз или введите состав вручную',
      );
    }

    if (!response.ok) {
      this.log.warn(`Провайдер ответил ${response.status}`);
      throw new ServiceUnavailableException(
        'Не удалось прочитать снимок — попробуйте ещё раз или введите состав вручную',
      );
    }

    return parseLabelResponse(await response.json());
  }
}
