import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applyVoiceTranscription } from './voice-transcription';
import { MotivationSettingsService } from './motivation-settings.service';

export type SpokenLine = {
  audio: Buffer;
  /** Длина записи в секундах — по ней потом растягивается ролик. */
  seconds: number;
};

const SYNC_BASE = 'https://fal.run';

/**
 * Фраза для образца голоса. Короткая ради цены и с теми именами, на которых
 * синтез спотыкается: слушать «раз-два-три» бесполезно, выбирают-то по тому,
 * как звучит «Бхагавад-гита».
 */
export const VOICE_PREVIEW_LINE =
  'Кришна объясняет Арджуне. Бхагавад-гита, глава три.';

/**
 * Озвучка цитаты.
 *
 * Отличается от звука, который умеет сочинять видеомодель, ровно одним, но
 * решающим: сюда уходит наш проверенный текст, и результат читает его, а не
 * выдумывает. Ту же логику мы применяем к подписи на кадре — буквы рисуем
 * сами, потому что проверить нарисованное нечем.
 *
 * Запрос синхронный: секунды речи считаются мгновенно, очередь тут ни к чему.
 */
@Injectable()
export class FalAudioService {
  constructor(
    private readonly config: ConfigService,
    private readonly settings: MotivationSettingsService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('FAL_KEY'));
  }

  private key(): string {
    const key = this.config.get<string>('FAL_KEY');
    if (!key)
      throw new ServiceUnavailableException('FAL_KEY is not configured');
    return key;
  }

  /** Имя модели наружу: оно входит в ключ кэша образцов. */
  async modelId(): Promise<string> {
    return (await this.settings.read()).voiceModel;
  }

  async speak(text: string, voice?: string | null): Promise<SpokenLine> {
    const spoken = text.trim();
    // Проверяем до сети: провайдер берёт деньги и за запрос, который сам же не
    // смог разобрать — на видеомодели это стоило $2.50.
    if (!spoken) throw new BadRequestException('Nothing to speak');

    const settings = await this.settings.read();
    const response = await fetch(`${SYNC_BASE}/${settings.voiceModel}`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: {
        authorization: `Key ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildSpeechRequest({
        // Ударения подставляем здесь, а не в тексте поста: цитата обязана
        // храниться дословно, без служебных пометок.
        text: applyVoiceTranscription(spoken),
        voice: voice?.trim() || settings.voiceName,
        model: settings.voiceModel,
      })),
    });
    if (!response.ok)
      throw new BadGatewayException(
        `Voice provider error ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );

    const payload = (await response.json().catch(() => null)) as {
      audio?: { url?: string };
      timestamps?: Array<{ end?: number; end_time?: number }>;
    } | null;
    const url = payload?.audio?.url;
    if (!url) throw new BadGatewayException('Voice provider returned no audio');

    const file = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!file.ok)
      throw new BadGatewayException(
        `Unable to download speech: ${file.status}`,
      );

    return {
      audio: Buffer.from(await file.arrayBuffer()),
      seconds: readDuration(payload?.timestamps, spoken),
    };
  }
}

/**
 * Короткий безопасный кусок ключа из имени модели.
 *
 * Идентификаторы содержат слэши, а они в ключе S3 создали бы лишние «папки» и
 * разъехались бы при смене провайдера.
 */
export function voicePreviewKey(model: string): string {
  return model.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'default';
}

/**
 * Тело запроса под конкретную модель.
 *
 * Набор полей у версий разный: v3 не принимает `speed` вовсе. Слать лишнее в
 * платный запрос не стоит — провайдер уже показал, что берёт деньги и за то,
 * чего не смог разобрать.
 */
export function buildSpeechRequest(input: {
  text: string;
  voice: string;
  model: string;
}): Record<string, unknown> {
  const request: Record<string, unknown> = {
    text: input.text,
    voice: input.voice,
    language_code: 'ru',
    // Тайминги нужны, чтобы узнать длину записи, не поднимая ffprobe.
    timestamps: true,
  };
  // Чуть медленнее обычного: цитата — не новостная лента, её слушают.
  if (!input.model.includes('eleven-v3')) request.speed = 0.95;
  return request;
}

/**
 * Длина записи из таймингов последнего слова.
 *
 * Провайдер отдаёт их не всегда, поэтому есть запасной расчёт по длине текста.
 * Занижать нельзя: ролик обрежется по этому числу, и речь оборвётся на
 * полуслове.
 */
export function readDuration(
  timestamps: Array<{ end?: number; end_time?: number }> | undefined,
  text: string,
): number {
  const last = timestamps?.[timestamps.length - 1];
  const end = last?.end ?? last?.end_time;
  if (typeof end === 'number' && end > 0) return end;
  // Примерно четырнадцать знаков в секунду — темп неспешного чтения вслух.
  return Math.max(3, Math.round(text.length / 14));
}
