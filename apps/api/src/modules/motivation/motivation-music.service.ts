import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MotivationTrackStatus } from '@prisma/client';
import type { Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationSettingsService } from './motivation-settings.service';
import {
  buildMusicPromptRequest,
  cleanMusicPrompt,
  DEFAULT_MUSIC_BRIEF,
} from './music-prompt';

const SYNC_BASE = 'https://fal.run';

/**
 * Библиотека музыкальных подложек.
 *
 * Трек создаётся один раз и играет во множестве роликов: клип длится секунды,
 * трек — полминуты, и платить за музыку под каждый пост незачем. Поэтому
 * генерация здесь — отдельное действие редакции, а не часть пайплайна.
 */
@Injectable()
export class MotivationMusicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: MotivationSettingsService,
    private readonly generation: MotivationGenerationService,
  ) {}

  private key(): string {
    const key = this.config.get<string>('FAL_KEY');
    if (!key)
      throw new ServiceUnavailableException('FAL_KEY is not configured');
    return key;
  }

  private admin(role: Role) {
    if (role !== 'admin') throw new ForbiddenException('Только администратор');
  }

  async list(role: Role) {
    this.admin(role);
    return this.prisma.motivationTrack.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  /**
   * Черновик промпта, сочинённый нашим же ИИ по смыслу цитаты.
   *
   * Руками такие промпты писать тяжело: модель музыки слушается инструментовки
   * и регистра, а не прилагательных. Редактор правит готовый черновик вместо
   * того, чтобы вспоминать, как формулировать.
   */
  async draftPrompt(
    role: Role,
    input: { postId?: string; mood?: string },
  ): Promise<{ prompt: string }> {
    this.admin(role);
    let meaning = input.mood?.trim() ?? '';
    let attribution: string | null = null;

    if (input.postId) {
      const post = await this.prisma.motivationPost.findUnique({
        where: { id: input.postId },
        include: {
          quote: true,
          translations: { where: { language: 'ru' }, take: 1 },
        },
      });
      if (!post) throw new NotFoundException('Пост не найден');
      meaning =
        post.translations[0]?.text ?? post.quote?.originalText ?? meaning;
      attribution = post.quote?.author ?? post.attributionSpeaker;
    }
    // Без описания берём общий замысел сервиса: кнопка должна давать результат
    // сразу, а пожелание редактора — уточнять его, а не быть условием запуска.
    if (!meaning) meaning = DEFAULT_MUSIC_BRIEF;

    const raw = await this.generation.generatePlainText(
      buildMusicPromptRequest({ meaning, attribution, mood: input.mood }),
      1_000,
    );
    return { prompt: cleanMusicPrompt(raw) };
  }

  async generate(
    role: Role,
    actorId: string,
    input: { title?: string; prompt: string; seconds?: number },
  ) {
    this.admin(role);
    const prompt = input.prompt?.trim();
    // Проверяем до сети: провайдер берёт деньги и за запрос, который сам же не
    // смог разобрать.
    if (!prompt) throw new BadRequestException('Пустой промпт');

    const settings = await this.settings.read();
    const model = settings.musicModel;
    const seconds = Math.max(10, Math.min(60, input.seconds ?? 20));

    const response = await fetch(`${SYNC_BASE}/${model}`, {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
      headers: {
        authorization: `Key ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildMusicRequest({ prompt, seconds, model })),
    });
    if (!response.ok)
      throw new BadGatewayException(
        `Music provider error ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );

    const payload = (await response.json().catch(() => null)) as {
      audio?: { url?: string };
      audio_file?: { url?: string };
    } | null;
    const url = payload?.audio?.url ?? payload?.audio_file?.url;
    if (!url) throw new BadGatewayException('Music provider returned no audio');

    const file = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!file.ok)
      throw new BadGatewayException(`Unable to download track: ${file.status}`);
    const bytes = Buffer.from(await file.arrayBuffer());

    // Кладём к себе сразу: ссылка провайдера временная, а трек должен пережить
    // и его, и смену модели.
    const stored = await this.generation.uploadStory(
      `motivation/music/${Date.now()}.mp3`,
      bytes,
      'audio/mpeg',
    );

    return this.prisma.motivationTrack.create({
      data: {
        title: input.title?.trim() || 'Без названия',
        prompt,
        url: stored,
        seconds,
        model,
        createdById: actorId,
      },
    });
  }

  async setStatus(role: Role, id: string, status: MotivationTrackStatus) {
    this.admin(role);
    const updated = await this.prisma.motivationTrack.updateMany({
      where: { id },
      data: { status },
    });
    if (!updated.count) throw new NotFoundException('Трек не найден');
    return { id, status };
  }

  async remove(role: Role, id: string): Promise<void> {
    this.admin(role);
    await this.prisma.motivationTrack.deleteMany({ where: { id } });
  }
}

/**
 * Тело запроса под конкретную модель музыки.
 *
 * Провайдеры расходятся: у ElevenLabs длина задаётся миллисекундами и есть
 * флаг «только инструментал», у остальных — секундами. Лишнее поле уходит в
 * платный запрос, поэтому собираем адресно.
 */
export function buildMusicRequest(input: {
  prompt: string;
  seconds: number;
  model: string;
}): Record<string, unknown> {
  if (input.model.includes('elevenlabs'))
    return {
      prompt: input.prompt,
      music_length_ms: input.seconds * 1_000,
      force_instrumental: true,
    };
  if (input.model.includes('lyria')) return { prompt: input.prompt };
  return { prompt: input.prompt, duration: input.seconds };
}
