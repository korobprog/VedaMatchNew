import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MOTIVATION_VOICES,
  type MotivationAiModerationMode,
  type MotivationVisualStyle,
  type MotivationVoice,
  type Role,
} from '@vedamatch/shared';
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
  musicModel: 'fal-ai/elevenlabs/music',
  autoQuoteDiscoveryEnabled: false,
  userReelsEnabled: true,
  userDailyLimit: 1,
  aiModerationMode: 'autonomous' as MotivationAiModerationMode,
  aiApproveThreshold: 0.75,
  aiRejectThreshold: 0.85,
  reportsToHide: 3,
  userVideoEnabled: false,
  /** Небольшой набор по умолчанию: два женских и два мужских. */
  userVoices: ['Aria', 'Sarah', 'Roger', 'Charlie'] as MotivationVoice[],
} as const;

const knownVoices = new Set<string>(MOTIVATION_VOICES);

const AI_MODES = new Set<string>(['off', 'assist', 'autonomous']);

export type MotivationSettings = {
  userVideoEnabled: boolean;
  userVoices: MotivationVoice[];
  userVoiceDefault: MotivationVoice | null;
  reportsToHide: number;
  autoQuoteDiscoveryEnabled: boolean;
  userReelsEnabled: boolean;
  userDailyLimit: number;
  aiModerationMode: MotivationAiModerationMode;
  aiApproveThreshold: number;
  aiRejectThreshold: number;
  aiEditorialRules: string;
  videoModel: string;
  videoSeconds: number;
  videoAudio: boolean;
  voiceModel: string;
  voiceName: string;
  imageModel: string;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number;
  musicModel: string;
  defaultTrackId: string | null;
};

export type MotivationSettingsUpdate = Partial<{
  userVoices: MotivationVoice[];
  userVoiceDefault: MotivationVoice | null;
  userVideoEnabled: boolean;
  reportsToHide: number;
  autoQuoteDiscoveryEnabled: boolean;
  userReelsEnabled: boolean;
  userDailyLimit: number;
  aiModerationMode: MotivationAiModerationMode;
  aiApproveThreshold: number;
  aiRejectThreshold: number;
  aiEditorialRules: string | null;
  videoModel: string | null;
  videoSeconds: number | null;
  videoAudio: boolean | null;
  voiceModel: string | null;
  voiceName: string | null;
  imageModel: string | null;
  visualStyle: MotivationVisualStyle | null;
  dailyBudgetUsd: number | null;
  musicModel: string | null;
  defaultTrackId: string | null;
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
      userVideoEnabled:
        row?.userVideoEnabled ?? SETTINGS_FALLBACK.userVideoEnabled,
      // Пустой список означает «ничего не выбирали», а не «голосов нет»:
      // иначе после первого сохранения настроек озвучка пропала бы совсем.
      userVoices: (row?.userVoices?.length
        ? row.userVoices
        : SETTINGS_FALLBACK.userVoices) as MotivationVoice[],
      userVoiceDefault: (row?.userVoiceDefault as MotivationVoice) ?? null,
      reportsToHide: row?.reportsToHide ?? SETTINGS_FALLBACK.reportsToHide,
      autoQuoteDiscoveryEnabled:
        row?.autoQuoteDiscoveryEnabled ??
        SETTINGS_FALLBACK.autoQuoteDiscoveryEnabled,
      userReelsEnabled:
        row?.userReelsEnabled ?? SETTINGS_FALLBACK.userReelsEnabled,
      userDailyLimit: row?.userDailyLimit ?? SETTINGS_FALLBACK.userDailyLimit,
      aiModerationMode:
        (row?.aiModerationMode as MotivationAiModerationMode) ??
        SETTINGS_FALLBACK.aiModerationMode,
      aiApproveThreshold: row?.aiApproveThreshold
        ? Number(row.aiApproveThreshold)
        : SETTINGS_FALLBACK.aiApproveThreshold,
      aiRejectThreshold: row?.aiRejectThreshold
        ? Number(row.aiRejectThreshold)
        : SETTINGS_FALLBACK.aiRejectThreshold,
      aiEditorialRules: row?.aiEditorialRules ?? '',
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
      musicModel:
        row?.musicModel ||
        this.config.get<string>('MOTIVATION_MUSIC_MODEL') ||
        SETTINGS_FALLBACK.musicModel,
      defaultTrackId: row?.defaultTrackId ?? null,
    };
  }

  async update(
    role: Role,
    input: MotivationSettingsUpdate,
  ): Promise<MotivationSettings> {
    if (role !== 'admin') throw new ForbiddenException('Только администратор');
    // Пустая строка от формы означает «вернуть наследование», а не пустую
    // модель: иначе очистив поле, админ получил бы неработающий сервис.
    if (
      input.aiModerationMode !== undefined &&
      !AI_MODES.has(input.aiModerationMode)
    )
      throw new BadRequestException('Неизвестный режим ИИ-модерации');
    if (
      input.userDailyLimit !== undefined &&
      (!Number.isInteger(input.userDailyLimit) ||
        input.userDailyLimit < 0 ||
        input.userDailyLimit > 100)
    )
      throw new BadRequestException('Дневной лимит — целое число от 0 до 100');
    for (const key of ['aiApproveThreshold', 'aiRejectThreshold'] as const) {
      const value = input[key];
      if (
        value !== undefined &&
        !(Number.isFinite(value) && value >= 0.5 && value <= 1)
      )
        throw new BadRequestException('Порог уверенности — число от 0.5 до 1');
    }
    if (
      input.reportsToHide !== undefined &&
      (!Number.isInteger(input.reportsToHide) ||
        input.reportsToHide < 1 ||
        input.reportsToHide > 100)
    )
      throw new BadRequestException('Порог жалоб — целое число от 1 до 100');
    if (input.userVoices !== undefined) {
      if (
        !Array.isArray(input.userVoices) ||
        input.userVoices.some((voice) => !knownVoices.has(voice))
      )
        throw new BadRequestException('В списке есть неизвестный голос');
    }
    if (
      input.userVoiceDefault !== undefined &&
      input.userVoiceDefault !== null &&
      !knownVoices.has(input.userVoiceDefault)
    )
      throw new BadRequestException('Неизвестный голос по умолчанию');
    const data = {
      ...(input.userVoices !== undefined
        ? { userVoices: [...new Set(input.userVoices)] }
        : {}),
      ...(input.userVoiceDefault !== undefined
        ? { userVoiceDefault: input.userVoiceDefault }
        : {}),
      ...(input.userVideoEnabled !== undefined
        ? { userVideoEnabled: Boolean(input.userVideoEnabled) }
        : {}),
      ...(input.reportsToHide !== undefined
        ? { reportsToHide: input.reportsToHide }
        : {}),
      ...(input.autoQuoteDiscoveryEnabled !== undefined
        ? { autoQuoteDiscoveryEnabled: Boolean(input.autoQuoteDiscoveryEnabled) }
        : {}),
      ...(input.userReelsEnabled !== undefined
        ? { userReelsEnabled: Boolean(input.userReelsEnabled) }
        : {}),
      ...(input.userDailyLimit !== undefined
        ? { userDailyLimit: input.userDailyLimit }
        : {}),
      ...(input.aiModerationMode !== undefined
        ? { aiModerationMode: input.aiModerationMode }
        : {}),
      ...(input.aiApproveThreshold !== undefined
        ? { aiApproveThreshold: input.aiApproveThreshold }
        : {}),
      ...(input.aiRejectThreshold !== undefined
        ? { aiRejectThreshold: input.aiRejectThreshold }
        : {}),
      ...(input.aiEditorialRules !== undefined
        ? { aiEditorialRules: blankToNull(input.aiEditorialRules) }
        : {}),
      ...pick(input, 'videoModel', blankToNull),
      ...pick(input, 'voiceModel', blankToNull),
      ...pick(input, 'voiceName', blankToNull),
      ...pick(input, 'imageModel', blankToNull),
      ...pick(input, 'musicModel', blankToNull),
      ...pick(input, 'defaultTrackId', blankToNull),
      ...pick(input, 'videoSeconds', positiveOrNull),
      ...pick(input, 'dailyBudgetUsd', positiveOrNull),
      ...(input.videoAudio !== undefined
        ? { videoAudio: input.videoAudio }
        : {}),
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
