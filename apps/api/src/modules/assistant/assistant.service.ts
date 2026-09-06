import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  resolveDisplayName,
  type AccessTokenPayload,
  type AssistantActionCard,
  type AssistantCard,
  type AssistantComposeRequest,
  type AssistantComposeResponse,
  type AssistantLinkCard,
  type AssistantMessageDto,
  type AssistantStateDto,
  type AssistantThreadDetail,
  type AssistantThreadDto,
  type ConfirmAssistantActionResponse,
  type SendAssistantMessageResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  actionSummary,
  describeForModel,
  parseStoredCards,
  pendingActionCard,
  toLinkCards,
} from './assistant-cards';
import {
  cleanComposedText,
  historyForModel,
  normalizeQuestion,
  titleFrom,
  type ModelMessage,
} from './assistant-conversation';
import { buildComposePrompt, buildSystemPrompt } from './assistant-prompt';
import { AssistantProviderService } from './assistant-provider.service';
import { parseToolCallArguments } from './assistant-provider';
import { AssistantQuotaService } from './assistant-quota.service';
import { reasonText } from './assistant-quota';
import { AssistantSettingsService } from './assistant-settings.service';
import {
  MAX_TOOL_ITEMS,
  parseToolArgs,
  toProviderTools,
  toolByName,
  ToolArgsError,
} from './assistant-tools';
import { AssistantToolsService } from './assistant-tools.service';

const THREADS_LIMIT = 20;
const MESSAGES_LIMIT = 200;
const MAX_CONTEXT_LINES = 8;
const MAX_CONTEXT_LINE = 300;

type ThreadRow = {
  id: string;
  kind: 'chat' | 'compose';
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards: unknown;
  toolsUsed: string[];
  failed: boolean;
  createdAt: Date;
};

const messageSelect = {
  id: true,
  role: true,
  text: true,
  cards: true,
  toolsUsed: true,
  failed: true,
  createdAt: true,
} as const;

const threadSelect = {
  id: true,
  kind: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Оркестратор: нити, вопрос → круг инструментов → ответ, подтверждение
 * действий и помощник переписки. Ассистент читает из портальных таблиц только
 * `User` (имя, этап, город) и каталог `Service` для системной инструкции; всё
 * остальное приходит от сервисов через шину.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssistantSettingsService,
    private readonly quota: AssistantQuotaService,
    private readonly provider: AssistantProviderService,
    private readonly tools: AssistantToolsService,
  ) {}

  async state(userId: string): Promise<AssistantStateDto> {
    const [settings, quota, threads] = await Promise.all([
      this.settings.get(),
      this.quota.state(userId),
      this.prisma.assistantThread.findMany({
        where: { userId, kind: 'chat' },
        orderBy: { updatedAt: 'desc' },
        take: THREADS_LIMIT,
        select: threadSelect,
      }),
    ]);
    return {
      enabled: settings.enabled,
      chatHelperEnabled: settings.enabled && settings.chatHelperEnabled,
      quota,
      threads: threads.map(toThreadDto),
    };
  }

  async createThread(userId: string): Promise<AssistantThreadDto> {
    const thread = await this.prisma.assistantThread.create({
      data: { userId, kind: 'chat' },
      select: threadSelect,
    });
    return toThreadDto(thread);
  }

  async thread(userId: string, id: string): Promise<AssistantThreadDetail> {
    const thread = await this.ownThread(userId, id);
    const messages = await this.prisma.assistantMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      take: MESSAGES_LIMIT,
      select: messageSelect,
    });
    return {
      thread: toThreadDto(thread),
      messages: messages.map(toMessageDto),
    };
  }

  async deleteThread(userId: string, id: string): Promise<void> {
    const thread = await this.ownThread(userId, id);
    await this.prisma.assistantThread.delete({ where: { id: thread.id } });
  }

  /** Вопрос → ответ. Нить создаётся по ходу, если её ещё нет. */
  async send(
    actor: AccessTokenPayload,
    threadId: string | null,
    rawText: unknown,
  ): Promise<SendAssistantMessageResponse> {
    const text = normalizeQuestion(rawText);
    if (!text) throw new BadRequestException('Напишите вопрос');
    const settings = await this.settings.get();
    if (!settings.enabled) throw new ForbiddenException(reasonText('disabled'));
    const decision = await this.quota.check(actor.sub);
    if (!decision.allowed)
      throw new ForbiddenException(reasonText(decision.reason));

    const thread = threadId
      ? await this.ownThread(actor.sub, threadId)
      : await this.prisma.assistantThread.create({
          data: { userId: actor.sub, kind: 'chat', title: titleFrom(text) },
          select: threadSelect,
        });
    if (!thread.title) {
      await this.prisma.assistantThread.update({
        where: { id: thread.id },
        data: { title: titleFrom(text) },
      });
      thread.title = titleFrom(text);
    }

    const history = await this.prisma.assistantMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { role: true, text: true, failed: true },
    });
    const userMessage = await this.prisma.assistantMessage.create({
      data: { threadId: thread.id, role: 'user', text },
      select: messageSelect,
    });

    const answer = await this.answer(actor, settings, [
      ...history.reverse(),
      { role: 'user', text, failed: false },
    ]);

    const assistantMessage = await this.prisma.assistantMessage.create({
      data: {
        threadId: thread.id,
        role: 'assistant',
        text: answer.text,
        cards: answer.cards as unknown as Prisma.InputJsonValue,
        toolsUsed: answer.toolsUsed,
        failed: answer.failed,
        tokensIn: answer.tokensIn,
        tokensOut: answer.tokensOut,
      },
      select: messageSelect,
    });
    await this.prisma.assistantThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    // Расход списывается и за неудачу: токены, потраченные до сбоя, реальны.
    await this.quota.record(actor.sub, {
      tokensIn: answer.tokensIn,
      tokensOut: answer.tokensOut,
      toolCalls: answer.toolsUsed.length,
    });

    return {
      thread: toThreadDto({ ...thread, updatedAt: new Date() }),
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
      quota: await this.quota.state(actor.sub),
    };
  }

  /**
   * Круг вопрос → инструменты → ответ. Модель зовёт инструменты, пока ей не
   * хватает данных, но не больше `maxToolRounds` раз: после этого она обязана
   * ответить словами тем, что уже есть.
   */
  private async answer(
    actor: AccessTokenPayload,
    settings: Awaited<ReturnType<AssistantSettingsService['get']>>,
    history: Array<{
      role: 'user' | 'assistant';
      text: string;
      failed: boolean;
    }>,
  ): Promise<{
    text: string;
    cards: AssistantCard[];
    toolsUsed: string[];
    failed: boolean;
    tokensIn: number;
    tokensOut: number;
  }> {
    const [user, services] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actor.sub },
        select: {
          name: true,
          spiritualName: true,
          spiritualStage: true,
          homeLocation: true,
        },
      }),
      this.prisma.service.findMany({
        where: { status: 'active', public: true },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, name: true, description: true, url: true },
      }),
    ]);
    const location = user?.homeLocation as { city?: string } | null;
    const system = buildSystemPrompt({
      services,
      user: {
        displayName: user ? resolveDisplayName(user) : 'участник',
        spiritualStage: user?.spiritualStage ?? null,
        city: typeof location?.city === 'string' ? location.city : null,
      },
      extra: settings.systemPromptExtra,
      actionsEnabled: settings.actionsEnabled,
    });
    const messages: ModelMessage[] = [
      { role: 'system', content: system },
      ...historyForModel(history),
    ];
    const providerTools = toProviderTools(undefined, {
      actionsEnabled: settings.actionsEnabled,
    });

    const cards: AssistantCard[] = [];
    const toolsUsed: string[] = [];
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      for (let round = 0; round <= settings.maxToolRounds; round += 1) {
        const last = round === settings.maxToolRounds;
        const completion = await this.provider.complete({
          messages,
          tools: providerTools,
          toolChoice: last ? 'none' : 'auto',
        });
        tokensIn += completion.usage.tokensIn;
        tokensOut += completion.usage.tokensOut;

        if (completion.toolCalls.length === 0 || last) {
          const text = completion.content.trim();
          return {
            text:
              text || 'Не нашлось, что ответить. Попробуйте переформулировать.',
            cards,
            toolsUsed,
            failed: false,
            tokensIn,
            tokensOut,
          };
        }

        messages.push({
          role: 'assistant',
          content: completion.content ?? '',
          tool_calls: completion.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        });

        const results = await Promise.all(
          completion.toolCalls.map(async (call) => {
            const tool = toolByName(call.name);
            if (!tool)
              return {
                id: call.id,
                content: JSON.stringify({ ok: false, error: 'unknown_tool' }),
              };
            let args: Record<string, unknown>;
            try {
              args = parseToolArgs(
                tool,
                parseToolCallArguments(call.arguments),
              );
            } catch (error) {
              return {
                id: call.id,
                content: JSON.stringify({
                  ok: false,
                  error:
                    error instanceof ToolArgsError
                      ? error.message
                      : 'bad_arguments',
                }),
              };
            }
            if (tool.requiresConfirmation) {
              if (!settings.actionsEnabled)
                return {
                  id: call.id,
                  content: JSON.stringify({
                    ok: false,
                    error: 'actions_disabled',
                  }),
                };
              cards.push(
                pendingActionCard({
                  action: tool.name,
                  label: tool.confirmLabel ?? 'Подтвердить',
                  summary: actionSummary(tool.name, args),
                  args,
                }),
              );
              toolsUsed.push(tool.name);
              return {
                id: call.id,
                content: JSON.stringify({
                  status: 'awaiting_user_confirmation',
                  note: 'Пользователь видит карточку с кнопкой подтверждения. Коротко скажи, что предложено, и попроси нажать кнопку. Не утверждай, что уже опубликовано.',
                }),
              };
            }
            const reply = await this.tools.invoke(tool, args, actor);
            toolsUsed.push(tool.name);
            const limit =
              typeof args.limit === 'number' ? args.limit : MAX_TOOL_ITEMS;
            const linkCards = toLinkCards(tool.service, reply?.items, limit);
            cards.push(...linkCards);
            return { id: call.id, content: describeForModel(reply, linkCards) };
          }),
        );
        for (const result of results)
          messages.push({
            role: 'tool',
            tool_call_id: result.id,
            content: result.content,
          });
      }
    } catch (error) {
      this.logger.warn(
        `Ответ не получился: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        text: 'Не получилось получить ответ: провайдер не ответил. Попробуйте ещё раз через минуту.',
        cards,
        toolsUsed,
        failed: true,
        tokensIn,
        tokensOut,
      };
    }
    // Недостижимо: цикл всегда возвращает на последнем круге.
    return {
      text: '',
      cards,
      toolsUsed,
      failed: true,
      tokensIn,
      tokensOut,
    };
  }

  /** Кнопка под карточкой действия: выполнить или отказаться. */
  async confirmAction(
    actor: AccessTokenPayload,
    threadId: string,
    input: { messageId: string; index: number; confirm: boolean },
  ): Promise<ConfirmAssistantActionResponse> {
    const thread = await this.ownThread(actor.sub, threadId);
    const message = await this.prisma.assistantMessage.findFirst({
      where: { id: input.messageId, threadId: thread.id, role: 'assistant' },
      select: messageSelect,
    });
    if (!message) throw new NotFoundException('Сообщение не найдено');
    const cards = parseStoredCards(message.cards);
    const card = cards[input.index];
    if (!card || card.kind !== 'action')
      throw new NotFoundException('Действие не найдено');
    if (card.status !== 'pending')
      throw new BadRequestException('Действие уже решено');

    let followUp: MessageRow | null = null;
    if (!input.confirm) {
      card.status = 'cancelled';
    } else {
      const settings = await this.settings.get();
      if (!settings.enabled || !settings.actionsEnabled)
        throw new ForbiddenException('Действия ассистента сейчас выключены');
      const tool = toolByName(card.action);
      if (!tool || !tool.requiresConfirmation)
        throw new BadRequestException('Неизвестное действие');
      const reply = await this.tools.invoke(tool, card.args, actor);
      const done = Boolean(reply?.ok);
      card.status = done ? 'confirmed' : 'failed';
      card.resultHref = done ? (reply?.href ?? null) : null;
      card.resultText =
        reply?.text ??
        (done ? 'Готово.' : 'Сервис не ответил — попробуйте позже.');
      const resultCards: AssistantLinkCard[] = toLinkCards(
        tool.service,
        reply?.items,
        MAX_TOOL_ITEMS,
      );
      followUp = await this.prisma.assistantMessage.create({
        data: {
          threadId: thread.id,
          role: 'assistant',
          text: card.resultText,
          cards: resultCards as unknown as Prisma.InputJsonValue,
          toolsUsed: [tool.name],
          failed: !done,
        },
        select: messageSelect,
      });
    }

    const updated = await this.prisma.assistantMessage.update({
      where: { id: message.id },
      data: { cards: cards as unknown as Prisma.InputJsonValue },
      select: messageSelect,
    });
    await this.prisma.assistantThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    return {
      message: toMessageDto(updated),
      followUp: followUp ? toMessageDto(followUp) : null,
    };
  }

  /**
   * Помощник переписки. Нить одна на человека и скрытая: запросы считаются в
   * квоту и метрики, но в списке бесед не мешаются.
   */
  async compose(
    actor: AccessTokenPayload,
    input: AssistantComposeRequest,
  ): Promise<AssistantComposeResponse> {
    const text = normalizeQuestion(input?.text);
    if (!text) throw new BadRequestException('Напишите, что нужно сочинить');
    const settings = await this.settings.get();
    if (!settings.enabled || !settings.chatHelperEnabled)
      throw new ForbiddenException('Помощник переписки сейчас выключен');
    const decision = await this.quota.check(actor.sub);
    if (!decision.allowed)
      throw new ForbiddenException(reasonText(decision.reason));

    const recipientName =
      typeof input.recipientName === 'string'
        ? input.recipientName.trim().slice(0, 80) || null
        : null;
    const context = Array.isArray(input.context)
      ? input.context
          .filter((line): line is string => typeof line === 'string')
          .map((line) => line.trim().slice(0, MAX_CONTEXT_LINE))
          .filter(Boolean)
          .slice(-MAX_CONTEXT_LINES)
      : [];

    const thread =
      (await this.prisma.assistantThread.findFirst({
        where: { userId: actor.sub, kind: 'compose' },
        select: threadSelect,
      })) ??
      (await this.prisma.assistantThread.create({
        data: {
          userId: actor.sub,
          kind: 'compose',
          title: 'Помощник переписки',
        },
        select: threadSelect,
      }));
    await this.prisma.assistantMessage.create({
      data: { threadId: thread.id, role: 'user', text },
    });

    let composed = '';
    let failed = false;
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const completion = await this.provider.complete({
        messages: [
          {
            role: 'system',
            content: buildComposePrompt({
              recipientName,
              context,
              extra: settings.systemPromptExtra,
            }),
          },
          { role: 'user', content: text },
        ],
        temperature: 0.6,
      });
      tokensIn = completion.usage.tokensIn;
      tokensOut = completion.usage.tokensOut;
      composed = cleanComposedText(completion.content);
      if (!composed) throw new Error('empty');
    } catch (error) {
      failed = true;
      this.logger.warn(
        `Помощник переписки не ответил: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await this.prisma.assistantMessage.create({
      data: {
        threadId: thread.id,
        role: 'assistant',
        text: composed,
        failed,
        tokensIn,
        tokensOut,
      },
    });
    await this.quota.record(actor.sub, { tokensIn, tokensOut, toolCalls: 0 });
    if (failed)
      throw new BadRequestException(
        'Не получилось составить текст — попробуйте ещё раз через минуту.',
      );
    return { text: composed, quota: await this.quota.state(actor.sub) };
  }

  private async ownThread(userId: string, id: string): Promise<ThreadRow> {
    const thread = await this.prisma.assistantThread.findFirst({
      where: { id, userId, kind: 'chat' },
      select: threadSelect,
    });
    if (!thread) throw new NotFoundException('Беседа не найдена');
    return thread;
  }
}

function toThreadDto(row: ThreadRow): AssistantThreadDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageDto(row: MessageRow): AssistantMessageDto {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    cards: parseStoredCards(row.cards),
    toolsUsed: row.toolsUsed,
    failed: row.failed,
    createdAt: row.createdAt.toISOString(),
  };
}

export type { AssistantActionCard };
