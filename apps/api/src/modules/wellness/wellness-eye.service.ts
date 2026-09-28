import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  buildEyeRequest,
  parseEyeResponse,
  type EyeAnswer,
  type EyeMode,
} from './eye-vision';

/**
 * «Третий глаз»: кадр с камеры → фраза для синтезатора речи.
 *
 * Провайдер тот же, что читает снимок состава (`wellness-recognize.service.ts`),
 * и настройки разбираются той же цепочкой — продублировано, а не вынесено,
 * по контракту сервисного модуля. Своя переменная `WELLNESS_EYE_MODEL` стоит
 * первой: здесь человек стоит на остановке и ждёт, и если модели состава
 * понадобится точность, а «глазу» скорость, их можно развести без выпуска.
 */
@Injectable()
export class WellnessEyeService {
  private readonly log = new Logger(WellnessEyeService.name);

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
    const model =
      env.WELLNESS_EYE_MODEL ||
      env.WELLNESS_VISION_MODEL ||
      env.ASSISTANT_TEXT_MODEL ||
      env.MOTIVATION_TEXT_MODEL ||
      'gpt-5.4';
    return { baseUrl, apiKey, model };
  }

  async look(
    mode: EyeMode,
    imageDataUrl: string,
    previous: string | null,
  ): Promise<EyeAnswer> {
    const settings = this.config();
    if (!settings) {
      throw new ServiceUnavailableException('Распознавание не настроено');
    }

    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(
          buildEyeRequest(settings.model, mode, imageDataUrl, previous),
        ),
        // Не 45 секунд, как у состава: через 20 секунд автобус уже уехал, и
        // ответ про него хуже, чем свежий кадр. Телефон повторит сам.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.log.warn(`Провайдер недоступен: ${String(error)}`);
      throw new ServiceUnavailableException('Не удалось разобрать кадр');
    }

    if (!response.ok) {
      this.log.warn(`Провайдер ответил ${response.status}`);
      throw new ServiceUnavailableException('Не удалось разобрать кадр');
    }

    return parseEyeResponse(await response.json());
  }
}
