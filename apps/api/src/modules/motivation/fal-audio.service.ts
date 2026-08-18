import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applyVoiceTranscription } from './voice-transcription';

export type SpokenLine = {
  audio: Buffer;
  /** Длина записи в секундах — по ней потом растягивается ролик. */
  seconds: number;
};

const SYNC_BASE = 'https://fal.run';

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
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('FAL_KEY'));
  }

  private key(): string {
    const key = this.config.get<string>('FAL_KEY');
    if (!key)
      throw new ServiceUnavailableException('FAL_KEY is not configured');
    return key;
  }

  private model(): string {
    return (
      this.config.get<string>('MOTIVATION_VOICE_MODEL') ||
      'fal-ai/elevenlabs/tts/multilingual-v2'
    );
  }

  private voice(): string {
    return this.config.get<string>('MOTIVATION_VOICE_NAME') || 'Rachel';
  }

  async speak(text: string, voice?: string | null): Promise<SpokenLine> {
    const spoken = text.trim();
    // Проверяем до сети: провайдер берёт деньги и за запрос, который сам же не
    // смог разобрать — на видеомодели это стоило $2.50.
    if (!spoken) throw new BadRequestException('Nothing to speak');

    const response = await fetch(`${SYNC_BASE}/${this.model()}`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: {
        authorization: `Key ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Ударения подставляем здесь, а не в тексте поста: цитата обязана
        // храниться дословно, без служебных пометок.
        text: applyVoiceTranscription(spoken),
        voice: voice?.trim() || this.voice(),
        // Чуть медленнее обычного: цитата — не новостная лента, её слушают.
        speed: 0.95,
        language_code: 'ru',
        // Просим тайминги, чтобы узнать длину записи, не поднимая ffprobe.
        timestamps: true,
      }),
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
