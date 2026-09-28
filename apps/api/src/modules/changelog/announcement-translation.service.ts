import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role, TranslateAnnouncementResponse } from '@vedamatch/shared';
import {
  AnnouncementTranslationError,
  buildAnnouncementTranslationRequest,
  normalizeTranslationInput,
  parseAnnouncementTranslation,
  resolveTranslationProviderConfig,
} from './announcement-translation';

/** Человек ждёт у формы: дольше полуминуты — уже «не работает». */
const TRANSLATION_TIMEOUT_MS = 30_000;

/**
 * Черновик английской версии новости (VED-144). Ничего не сохраняет: перевод
 * возвращается в форму, человек его вычитывает и сохраняет вместе с новостью.
 */
@Injectable()
export class AnnouncementTranslationService {
  private readonly logger = new Logger(AnnouncementTranslationService.name);

  constructor(private readonly config: ConfigService) {}

  async translate(
    role: Role,
    raw: unknown,
  ): Promise<TranslateAnnouncementResponse> {
    if (role !== 'admin')
      throw new ForbiddenException('Доступ только для администратора');

    let input: ReturnType<typeof normalizeTranslationInput>;
    try {
      input = normalizeTranslationInput(raw);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const provider = resolveTranslationProviderConfig({
      CHANGELOG_AI_BASE_URL: this.config.get<string>('CHANGELOG_AI_BASE_URL'),
      CHANGELOG_AI_API_KEY: this.config.get<string>('CHANGELOG_AI_API_KEY'),
      CHANGELOG_TEXT_MODEL: this.config.get<string>('CHANGELOG_TEXT_MODEL'),
      MOTIVATION_AI_BASE_URL: this.config.get<string>('MOTIVATION_AI_BASE_URL'),
      MOTIVATION_AI_API_KEY: this.config.get<string>('MOTIVATION_AI_API_KEY'),
      MOTIVATION_TEXT_MODEL: this.config.get<string>('MOTIVATION_TEXT_MODEL'),
    });
    if (!provider)
      throw new ServiceUnavailableException(
        'Автоперевод не настроен: нет ключа ИИ-провайдера. Заполните английскую версию вручную.',
      );

    let response: Response;
    try {
      response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${provider.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          buildAnnouncementTranslationRequest(input, provider.model),
        ),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.warn(
        `Перевод новости: провайдер недоступен (${(error as Error).message})`,
      );
      throw new ServiceUnavailableException(
        timedOut
          ? 'Переводчик не ответил за 30 секунд. Попробуйте ещё раз чуть позже.'
          : 'Переводчик недоступен. Попробуйте ещё раз чуть позже.',
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      this.logger.warn(
        `Перевод новости: провайдер ответил ${response.status}: ${detail}`,
      );
      throw new BadGatewayException(
        `Переводчик вернул ошибку ${response.status}. Попробуйте ещё раз чуть позже.`,
      );
    }

    try {
      return parseAnnouncementTranslation(await response.json(), input);
    } catch (error) {
      const message =
        error instanceof AnnouncementTranslationError
          ? error.message
          : 'Переводчик вернул не JSON';
      throw new BadGatewayException(`${message}. Попробуйте ещё раз.`);
    }
  }
}
