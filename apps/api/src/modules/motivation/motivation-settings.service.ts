import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MotivationVisualStyle, Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const SETTINGS_ID = 'global';

/** Значения по умолчанию, когда не задано ни в базе, ни в окружении. */
export const SETTINGS_FALLBACK = {
  videoModel: 'wan/v2.6/image-to-video/flash',
  videoSeconds: 5,
  videoAudio: false,
  voiceModel: 'fal-ai/elevenlabs/tts/eleven-v3',
  voiceName: 'Rachel',
  imageModel: 'gpt-image-2',
  dailyBudgetUsd: 5,
} as const;

export type MotivationSettings = {
  videoModel: string;
  videoSeconds: number;
  videoAudio: boolean;
  voiceModel: string;
  voiceName: string;
  imageModel: string;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number;
};

export type MotivationSettingsUpdate = Partial<{
  videoModel: string | null;
  videoSeconds: number | null;
  videoAudio: boolean | null;
  voiceModel: string | null;
  voiceName: string | null;
  imageModel: string | null;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number | null;
}>;

/**
 * Настройки сервиса.
 *
 * Порядок старшинства: база → окружение → значение из кода. Окружение оставлено
 * посередине намеренно: пока настройки не заведены через админку, всё работает
 * ровно как раньше, и переносить их можно по одной.
 *
 * Секреты сюда не попадают: `FAL_KEY` и доступы к S3 остаются в окружении, их
 * место не в базе и не в интерфейсе.
 */
@Injectable()
export class MotivationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async read(): Promise<MotivationSettings> {
    const row = await this.prisma.motivationSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return {
      videoModel:
        row?.videoModel ||
        this.config.get<string>('MOTIVATION_VIDEO_MODEL') ||
        SETTINGS_FALLBACK.videoModel,
      videoSeconds:
        row?.videoSeconds ??
        numberOrNull(this.config.get('MOTIVATION_VIDEO_DURATION')) ??
        SETTINGS_FALLBACK.videoSeconds,
      videoAudio:
        row?.videoAudio ??
        (this.config.get<string>('MOTIVATION_VIDEO_AUDIO') === 'true' ||
          SETTINGS_FALLBACK.videoAudio),
      voiceModel:
        row?.voiceModel ||
        this.config.get<string>('MOTIVATION_VOICE_MODEL') ||
        SETTINGS_FALLBACK.voiceModel,
      voiceName:
        row?.voiceName ||
        this.config.get<string>('MOTIVATION_VOICE_NAME') ||
        SETTINGS_FALLBACK.voiceName,
      imageModel:
        row?.imageModel ||
        this.config.get<string>('MOTIVATION_IMAGE_MODEL') ||
        SETTINGS_FALLBACK.imageModel,
      visualStyle: (row?.visualStyle as MotivationVisualStyle) ?? null,
      dailyBudgetUsd:
        (row?.dailyBudgetUsd ? Number(row.dailyBudgetUsd) : null) ??
        numberOrNull(this.config.get('MOTIVATION_AI_DAILY_BUDGET_USD')) ??
        SETTINGS_FALLBACK.dailyBudgetUsd,
    };
  }

  async update(
    role: Role,
    input: MotivationSettingsUpdate,
  ): Promise<MotivationSettings> {
    if (role !== 'admin') throw new ForbiddenException('Только администратор');
    // Пустая строка от формы означает «вернуть наследование», а не пустую
    // модель: иначе очистив поле, админ получил бы неработающий сервис.
    const data = {
      ...pick(input, 'videoModel', blankToNull),
      ...pick(input, 'voiceModel', blankToNull),
      ...pick(input, 'voiceName', blankToNull),
      ...pick(input, 'imageModel', blankToNull),
      ...pick(input, 'videoSeconds', positiveOrNull),
      ...pick(input, 'dailyBudgetUsd', positiveOrNull),
      ...(input.videoAudio !== undefined ? { videoAudio: input.videoAudio } : {}),
      ...(input.visualStyle !== undefined
        ? { visualStyle: input.visualStyle }
        : {}),
    };
    await this.prisma.motivationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    return this.read();
  }
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function blankToNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function positiveOrNull(value: unknown): number | null {
  return numberOrNull(value);
}

function pick<K extends keyof MotivationSettingsUpdate>(
  input: MotivationSettingsUpdate,
  key: K,
  normalise: (value: unknown) => string | number | null,
): Record<string, string | number | null> {
  return input[key] !== undefined ? { [key]: normalise(input[key]) } : {};
}
