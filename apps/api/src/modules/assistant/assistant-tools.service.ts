import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AccessTokenPayload,
  AssistantToolReply,
  AssistantToolRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { pickReply } from './assistant-cards';
import { toolEventName, type AssistantToolDefinition } from './assistant-tools';

/** Сервис обязан ответить быстро: человек ждёт ответа в чате. */
const TOOL_TIMEOUT_MS = 12_000;

/**
 * Диспетчер инструментов: событие в шину, ответ от слушателя сервиса, запись
 * в журнал вызовов для метрик. Молчащий или упавший сервис — не ошибка
 * ассистента: модель получает «сервис недоступен» и отвечает без него.
 */
@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);

  constructor(
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async invoke(
    tool: AssistantToolDefinition,
    args: Record<string, unknown>,
    actor: AccessTokenPayload,
    locale = 'ru',
  ): Promise<AssistantToolReply | null> {
    const request: AssistantToolRequest = {
      tool: tool.name,
      args,
      userId: actor.sub,
      actor: {
        sub: actor.sub,
        email: actor.email,
        role: actor.role,
        adminServices: actor.adminServices,
      },
      locale,
    };
    const startedAt = Date.now();
    let reply: AssistantToolReply | null = null;
    try {
      const replies = await Promise.race([
        this.events.emitAsync(toolEventName(tool.name), request),
        new Promise<unknown[]>((resolve) =>
          setTimeout(() => resolve([]), TOOL_TIMEOUT_MS).unref(),
        ),
      ]);
      reply = pickReply(replies);
    } catch (error) {
      this.logger.warn(
        `Инструмент ${tool.name} упал: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const durationMs = Date.now() - startedAt;
    if (!reply)
      this.logger.warn(
        `Инструмент ${tool.name} не ответил за ${durationMs} мс`,
      );

    // Журнал — для метрик, и его сбой не должен ронять ответ.
    await this.prisma.assistantToolCall
      .create({
        data: {
          userId: actor.sub,
          tool: tool.name,
          service: tool.service,
          ok: reply?.ok ?? false,
          durationMs,
        },
      })
      .catch(() => undefined);
    return reply;
  }
}
