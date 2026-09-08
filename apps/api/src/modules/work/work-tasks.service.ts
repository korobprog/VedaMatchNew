import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  WORK_CHECKLIST_TEXT_MAX,
  WORK_COMMENT_MAX,
  WORK_TASK_DESCRIPTION_MAX,
  WORK_TASK_TITLE_MAX,
  type CreateWorkChecklistItemRequest,
  type CreateWorkCommentRequest,
  type CreateWorkTaskRequest,
  type MoveWorkTaskRequest,
  type UpdateWorkChecklistItemRequest,
  type UpdateWorkTaskRequest,
  type WorkAgendaDto,
  type WorkAgendaItemDto,
  type WorkAttachmentDto,
  type WorkTaskDto,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WORK_EVENTS,
  workTaskRecipients,
  type WorkTaskAssignedEvent,
  type WorkTaskCommentedEvent,
} from './work-events';
import { WorkNoticesService } from './work-notices.service';
import {
  toWorkAgendaItem,
  toWorkPerson,
  toWorkTaskCard,
  workAgendaBucket,
} from './work-dto';
import { WORK_POSITION_STEP, resolveMovePosition } from './work-position';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';
import {
  validateWorkUpload,
  workAttachmentName,
  workUploadKindFor,
} from './work-upload-rules';
import {
  WorkUploadsService,
  type UploadedWorkFile,
} from './work-uploads.service';
import {
  normalizeWorkPriority,
  optionalText,
  parseWorkDueAt,
  requireText,
  workTaskKey,
} from './work-validate';

const workUserSelect = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const taskCardInclude = {
  assignee: { select: workUserSelect },
  labels: { include: { label: true } },
  checklist: { select: { done: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.WorkTaskInclude;

/** Сколько записей истории показывает карточка. Журнал, а не архив. */
const ACTIVITY_LIMIT = 50;

@Injectable()
export class WorkTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: WorkSpacesService,
    private readonly events: EventEmitter2,
    private readonly uploads: WorkUploadsService,
    private readonly notices: WorkNoticesService,
  ) {}

  /**
   * Всё, что нужно уведомлению, одним запросом: подписчик не имеет права
   * дочитывать это из наших таблиц, поэтому едет в самом событии.
   */
  private async notifyContext(taskId: string, actorId: string) {
    const [task, actor] = await Promise.all([
      this.prisma.workTask.findUnique({
        where: { id: taskId },
        select: {
          number: true,
          title: true,
          spaceId: true,
          assigneeId: true,
          createdById: true,
          space: { select: { name: true, prefix: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, spiritualName: true },
      }),
    ]);
    if (!task) return null;
    return {
      task,
      taskKey: workTaskKey(task.space.prefix, task.number),
      actorName: actor ? resolveDisplayName(actor) : 'Участник',
    };
  }

  private async taskContext(taskId: string) {
    const task = await this.prisma.workTask.findUnique({
      where: { id: taskId },
      select: { id: true, spaceId: true, boardId: true, columnId: true },
    });
    if (!task) throw new NotFoundException('Задача не найдена');
    return task;
  }

  /** Карточка целиком — то, что открывается по нажатию. */
  async get(taskId: string, userId: string): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(await this.spaces.roleOf(context.spaceId, userId), 'view');

    const task = await this.prisma.workTask.findUnique({
      where: { id: taskId },
      include: {
        ...taskCardInclude,
        space: { select: { prefix: true } },
        createdBy: { select: workUserSelect },
        checklist: { orderBy: { position: 'asc' } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: workUserSelect } },
        },
        attachments: { orderBy: { createdAt: 'asc' } },
        activity: {
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_LIMIT,
          include: { actor: { select: workUserSelect } },
        },
      },
    });
    if (!task) throw new NotFoundException('Задача не найдена');

    const card = toWorkTaskCard(
      {
        ...task,
        checklist: task.checklist.map((item) => ({ done: item.done })),
      },
      task.space.prefix,
    );

    return {
      ...card,
      boardId: task.boardId,
      spaceId: task.spaceId,
      description: task.description,
      createdBy: task.createdBy
        ? {
            userId: toWorkPerson(task.createdBy).userId,
            name: toWorkPerson(task.createdBy).name,
          }
        : null,
      checklist: task.checklist.map((item) => ({
        id: item.id,
        text: item.text,
        done: item.done,
        position: item.position,
      })),
      comments: task.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        author: comment.author ? toWorkPerson(comment.author) : null,
        createdAt: comment.createdAt.toISOString(),
        editedAt: comment.editedAt?.toISOString() ?? null,
      })),
      attachments: await this.signAttachments(task.attachments),
      activity: task.activity.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        actor: entry.actor
          ? {
              userId: entry.actor.id,
              name: toWorkPerson(entry.actor).name,
            }
          : null,
        payload: (entry.payload ?? {}) as Record<string, unknown>,
        createdAt: entry.createdAt.toISOString(),
      })),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      archivedAt: task.archivedAt?.toISOString() ?? null,
    };
  }

  async create(
    boardId: string,
    userId: string,
    request: CreateWorkTaskRequest,
  ): Promise<WorkTaskDto> {
    const board = await this.prisma.workBoard.findUnique({
      where: { id: boardId },
      select: { id: true, spaceId: true },
    });
    if (!board) throw new NotFoundException('Доска не найдена');
    assertWorkAccess(
      await this.spaces.roleOf(board.spaceId, userId),
      'editTask',
    );

    const column = await this.prisma.workColumn.findFirst({
      where: { id: request.columnId, boardId },
      select: { id: true, isDone: true },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');

    const title = requireText(
      request.title,
      'Название задачи',
      WORK_TASK_TITLE_MAX,
    );
    const description = optionalText(
      request.description,
      'Описание',
      WORK_TASK_DESCRIPTION_MAX,
    );
    const dueAt = parseWorkDueAt(request.dueAt);
    await this.assertAssigneeIsMember(board.spaceId, request.assigneeId);

    const last = await this.prisma.workTask.findFirst({
      where: { columnId: column.id, archivedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      // Номер выдаётся счётчиком среды и назад не возвращается: удалённая
      // задача не должна отдать свой номер новой, иначе ссылка «VM-14» из
      // переписки однажды уведёт к чужому делу.
      const space = await tx.workSpace.update({
        where: { id: board.spaceId },
        data: { taskSeq: { increment: 1 } },
        select: { taskSeq: true },
      });
      const task = await tx.workTask.create({
        data: {
          spaceId: board.spaceId,
          boardId,
          columnId: column.id,
          number: space.taskSeq,
          title,
          description,
          position: (last?.position ?? 0) + WORK_POSITION_STEP,
          priority: normalizeWorkPriority(request.priority),
          dueAt,
          assigneeId: request.assigneeId ?? null,
          createdById: userId,
          completedAt: column.isDone ? new Date() : null,
          labels: request.labelIds?.length
            ? { create: request.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
      });
      await tx.workActivity.create({
        data: {
          spaceId: board.spaceId,
          taskId: task.id,
          actorId: userId,
          kind: 'task_created',
          payload: { title },
        },
      });
      return task;
    });

    return this.get(created.id, userId);
  }

  async update(
    taskId: string,
    userId: string,
    request: UpdateWorkTaskRequest,
  ): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );

    const data: Prisma.WorkTaskUpdateInput = {};
    if (request.title !== undefined) {
      data.title = requireText(
        request.title,
        'Название задачи',
        WORK_TASK_TITLE_MAX,
      );
    }
    if (request.description !== undefined) {
      data.description = optionalText(
        request.description,
        'Описание',
        WORK_TASK_DESCRIPTION_MAX,
      );
    }
    if (request.priority !== undefined) {
      data.priority = normalizeWorkPriority(request.priority);
    }
    if (request.dueAt !== undefined) data.dueAt = parseWorkDueAt(request.dueAt);
    if (request.assigneeId !== undefined) {
      await this.assertAssigneeIsMember(context.spaceId, request.assigneeId);
      data.assignee = request.assigneeId
        ? { connect: { id: request.assigneeId } }
        : { disconnect: true };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workTask.update({ where: { id: taskId }, data });
      if (request.labelIds !== undefined) {
        await tx.workTaskLabel.deleteMany({ where: { taskId } });
        if (request.labelIds.length > 0) {
          await tx.workTaskLabel.createMany({
            data: request.labelIds.map((labelId) => ({ taskId, labelId })),
            skipDuplicates: true,
          });
        }
      }
      if (request.assigneeId !== undefined && request.assigneeId) {
        await tx.workActivity.create({
          data: {
            spaceId: context.spaceId,
            taskId,
            actorId: userId,
            kind: 'task_assigned',
            payload: { assigneeId: request.assigneeId },
          },
        });
      }
      if (request.dueAt !== undefined) {
        await tx.workActivity.create({
          data: {
            spaceId: context.spaceId,
            taskId,
            actorId: userId,
            kind: 'task_due_set',
            payload: { dueAt: request.dueAt },
          },
        });
      }
    });

    // Поручение — единственная правка карточки, о которой человеку нужно
    // узнать сразу: остальные поля он увидит, когда откроет её сам.
    if (request.assigneeId && request.assigneeId !== userId) {
      const notify = await this.notifyContext(taskId, userId);
      if (notify) {
        this.events.emit(WORK_EVENTS.taskAssigned, {
          name: WORK_EVENTS.taskAssigned,
          recipientId: request.assigneeId,
          spaceId: notify.task.spaceId,
          taskKey: notify.taskKey,
          taskTitle: notify.task.title,
          spaceName: notify.task.space.name,
          actorName: notify.actorName,
        } satisfies WorkTaskAssignedEvent);
      }
    }

    return this.get(taskId, userId);
  }

  /**
   * Перенос карточки. Соседи, а не индекс: пока запрос летел, доску мог
   * поменять другой человек, и «поставить третьей» промахнётся.
   */
  async move(
    taskId: string,
    userId: string,
    request: MoveWorkTaskRequest,
  ): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );

    const column = await this.prisma.workColumn.findFirst({
      where: { id: request.columnId, boardId: context.boardId },
      select: { id: true, name: true, isDone: true },
    });
    if (!column) throw new NotFoundException('Колонка не найдена');

    const ordered = await this.prisma.workTask.findMany({
      where: { columnId: column.id, archivedAt: null, id: { not: taskId } },
      orderBy: { position: 'asc' },
      select: { id: true, position: true },
    });
    const { position, rebalance } = resolveMovePosition(
      ordered,
      request.afterTaskId,
      request.beforeTaskId,
    );

    const wasDone = await this.prisma.workTask.findUnique({
      where: { id: taskId },
      select: { completedAt: true, columnId: true },
    });

    await this.prisma.workTask.update({
      where: { id: taskId },
      data: {
        columnId: column.id,
        position,
        // Колонка «готово» закрывает задачу, выезд из неё — открывает обратно.
        // Иначе карточка, вынутая из «Готово» на доработку, остаётся закрытой
        // в отчётах и не попадает в «Мой день».
        completedAt: column.isDone
          ? (wasDone?.completedAt ?? new Date())
          : null,
      },
    });

    if (rebalance) await this.rebalanceColumn(column.id);

    if (wasDone && wasDone.columnId !== column.id) {
      await this.prisma.workActivity.create({
        data: {
          spaceId: context.spaceId,
          taskId,
          actorId: userId,
          kind: column.isDone ? 'task_completed' : 'task_moved',
          payload: { from: wasDone.columnId, to: column.id },
        },
      });
    }

    // Уведомление не уходит по клику: перенос — единственное действие, которое
    // человек отменяет через минуту («поставил в тест, а там не дописано»), и
    // пуш, ушедший сразу, к этому моменту уже врёт. Кладём в очередь, а через
    // окно воркер посмотрит, где карточка осталась на самом деле, и решит,
    // есть ли вообще новость. См. work-notice.ts.
    if (wasDone && wasDone.columnId !== column.id) {
      const task = await this.prisma.workTask.findUnique({
        where: { id: taskId },
        select: { id: true, assigneeId: true, createdById: true },
      });
      if (task) {
        await this.notices.enqueueMove(task, userId, wasDone.columnId);
      }
    }

    return this.get(taskId, userId);
  }

  /**
   * Перенумерация колонки. Нужна редко (зазор схлопывается примерно после
   * полусотни вставок в одно и то же место), но без неё карточки начинают
   * менять порядок сами по себе — см. work-position.ts.
   */
  private async rebalanceColumn(columnId: string): Promise<void> {
    const ordered = await this.prisma.workTask.findMany({
      where: { columnId, archivedAt: null },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction(
      ordered.map((task, index) =>
        this.prisma.workTask.update({
          where: { id: task.id },
          data: { position: index * WORK_POSITION_STEP },
        }),
      ),
    );
  }

  /** Удаление — это архив: «куда делась карточка» не должно быть вопросом. */
  async archive(taskId: string, userId: string): Promise<void> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );
    await this.prisma.$transaction([
      this.prisma.workTask.update({
        where: { id: taskId },
        data: { archivedAt: new Date() },
      }),
      this.prisma.workActivity.create({
        data: {
          spaceId: context.spaceId,
          taskId,
          actorId: userId,
          kind: 'task_archived',
          payload: {},
        },
      }),
    ]);
  }

  async addComment(
    taskId: string,
    userId: string,
    request: CreateWorkCommentRequest,
  ): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );
    const body = requireText(request.body, 'Комментарий', WORK_COMMENT_MAX);

    await this.prisma.$transaction([
      this.prisma.workComment.create({
        data: { taskId, authorId: userId, body },
      }),
      this.prisma.workActivity.create({
        data: {
          spaceId: context.spaceId,
          taskId,
          actorId: userId,
          kind: 'comment_added',
          payload: {},
        },
      }),
    ]);

    const notify = await this.notifyContext(taskId, userId);
    if (notify) {
      for (const recipientId of workTaskRecipients(notify.task, userId)) {
        this.events.emit(WORK_EVENTS.taskCommented, {
          name: WORK_EVENTS.taskCommented,
          recipientId,
          spaceId: notify.task.spaceId,
          taskKey: notify.taskKey,
          taskTitle: notify.task.title,
          actorName: notify.actorName,
          excerpt: body,
        } satisfies WorkTaskCommentedEvent);
      }
    }

    return this.get(taskId, userId);
  }

  /**
   * Подписанные адреса вложений. Ссылка живёт шесть часов и собирается на
   * каждый показ карточки: в базе лежит ключ объекта, а не адрес, — записанный
   * адрес протух бы к следующему открытию.
   *
   * Ключ, который не удалось подписать (S3 не настроен в разработке), отдаётся
   * пустой ссылкой, а не выбрасывается из списка: вложение существует, и
   * карточка должна говорить об этом, а не притворяться, что файла нет.
   */
  private async signAttachments(
    attachments: readonly {
      id: string;
      name: string;
      mime: string;
      sizeBytes: number;
      width: number | null;
      height: number | null;
      storageKey: string;
      createdAt: Date;
    }[],
  ): Promise<WorkAttachmentDto[]> {
    return Promise.all(
      attachments.map(async (file) => ({
        id: file.id,
        name: file.name,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        width: file.width,
        height: file.height,
        url: await this.uploads.signedUrl(file.storageKey),
        createdAt: file.createdAt.toISOString(),
      })),
    );
  }

  /**
   * Приложить файл к задаче.
   *
   * Право то же, что у комментария (`editTask`): наблюдателя позвали смотреть,
   * а вложение — такое же изменение задачи, как строка обсуждения.
   *
   * Порядок «сначала в бакет, потом строка в базе» намеренный. Обратный
   * оставлял бы в карточке вложение, за которым ничего нет, а так худшее —
   * файл в бакете, на который никто не ссылается: его уберёт та же чистка,
   * что и остальной мусор.
   */
  async addAttachment(
    taskId: string,
    userId: string,
    file: UploadedWorkFile | undefined,
  ): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );

    const denial = validateWorkUpload(file);
    if (denial === 'unsupported_type')
      throw new UnsupportedMediaTypeException(
        'Такие файлы к задаче не прикладываются',
      );
    if (denial === 'file_too_large')
      throw new BadRequestException('Файл слишком большой');

    if (!this.uploads.configured) {
      this.uploads.warnUnavailable(taskId);
      throw new ServiceUnavailableException(
        'Хранилище файлов недоступно — вложение не сохранено',
      );
    }

    const stored = await this.uploads.store(taskId, file!);
    if (!stored)
      throw new ServiceUnavailableException(
        'Хранилище файлов недоступно — вложение не сохранено',
      );

    await this.prisma.workAttachment.create({
      data: {
        taskId,
        uploaderId: userId,
        storageKey: stored.storageKey,
        name: workAttachmentName(
          file!.originalname,
          workUploadKindFor(file!.mimetype) ?? 'file',
        ),
        mime: stored.mime,
        sizeBytes: stored.sizeBytes,
        width: stored.width,
        height: stored.height,
      },
    });

    return this.get(taskId, userId);
  }

  /**
   * Убрать вложение.
   *
   * Файл уходит из бакета следом за строкой: вложение задачи — не документ,
   * который кто-то мог сохранить себе ссылкой, а частная картинка среды, и
   * оставлять её лежать после удаления значило бы держать живой подписанную
   * ссылку, которую уже успели переслать.
   */
  async removeAttachment(
    attachmentId: string,
    userId: string,
  ): Promise<WorkTaskDto> {
    const attachment = await this.prisma.workAttachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, taskId: true, storageKey: true },
    });
    if (!attachment) throw new NotFoundException('Вложение не найдено');

    const context = await this.taskContext(attachment.taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );

    await this.prisma.workAttachment.delete({ where: { id: attachment.id } });
    await this.uploads.removeMany([attachment.storageKey]);

    return this.get(attachment.taskId, userId);
  }

  async addChecklistItem(
    taskId: string,
    userId: string,
    request: CreateWorkChecklistItemRequest,
  ): Promise<WorkTaskDto> {
    const context = await this.taskContext(taskId);
    assertWorkAccess(
      await this.spaces.roleOf(context.spaceId, userId),
      'editTask',
    );
    const last = await this.prisma.workChecklistItem.findFirst({
      where: { taskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.workChecklistItem.create({
      data: {
        taskId,
        text: requireText(request.text, 'Пункт', WORK_CHECKLIST_TEXT_MAX),
        position: (last?.position ?? 0) + WORK_POSITION_STEP,
      },
    });
    return this.get(taskId, userId);
  }

  async updateChecklistItem(
    itemId: string,
    userId: string,
    request: UpdateWorkChecklistItemRequest,
  ): Promise<WorkTaskDto> {
    const item = await this.prisma.workChecklistItem.findUnique({
      where: { id: itemId },
      select: { taskId: true, task: { select: { spaceId: true } } },
    });
    if (!item) throw new NotFoundException('Пункт не найден');
    assertWorkAccess(
      await this.spaces.roleOf(item.task.spaceId, userId),
      'editTask',
    );

    const data: Prisma.WorkChecklistItemUpdateInput = {};
    if (request.text !== undefined) {
      data.text = requireText(request.text, 'Пункт', WORK_CHECKLIST_TEXT_MAX);
    }
    if (request.done !== undefined) data.done = request.done;

    await this.prisma.workChecklistItem.update({ where: { id: itemId }, data });
    return this.get(item.taskId, userId);
  }

  async removeChecklistItem(
    itemId: string,
    userId: string,
  ): Promise<WorkTaskDto> {
    const item = await this.prisma.workChecklistItem.findUnique({
      where: { id: itemId },
      select: { taskId: true, task: { select: { spaceId: true } } },
    });
    if (!item) throw new NotFoundException('Пункт не найден');
    assertWorkAccess(
      await this.spaces.roleOf(item.task.spaceId, userId),
      'editTask',
    );
    await this.prisma.workChecklistItem.delete({ where: { id: itemId } });
    return this.get(item.taskId, userId);
  }

  /**
   * «Мой день»: задачи со сроком по всем средам сразу. Ради этого экрана
   * `spaceId` и продублирован в задаче — иначе тут join через доску.
   */
  async agenda(userId: string, now = new Date()): Promise<WorkAgendaDto> {
    const tasks = await this.prisma.workTask.findMany({
      where: {
        assigneeId: userId,
        completedAt: null,
        archivedAt: null,
        space: { archivedAt: null },
      },
      orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      select: {
        id: true,
        number: true,
        title: true,
        boardId: true,
        dueAt: true,
        priority: true,
        space: { select: { id: true, name: true, prefix: true, color: true } },
      },
    });

    const buckets: WorkAgendaDto = {
      overdue: [],
      today: [],
      soon: [],
      undated: [],
    };
    for (const task of tasks) {
      const item: WorkAgendaItemDto = toWorkAgendaItem(task, task.space);
      buckets[workAgendaBucket(task.dueAt, now)].push(item);
    }
    return buckets;
  }

  /**
   * Исполнителем можно назначить только участника среды. Иначе задача уезжает
   * человеку, который её не видит, — и висит невыполненной, пока не спросят.
   */
  private async assertAssigneeIsMember(
    spaceId: string,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeId) return;
    const member = await this.spaces.roleOf(spaceId, assigneeId);
    if (!member) {
      throw new BadRequestException(
        'Исполнителем можно назначить только участника среды',
      );
    }
  }

  /** Номер задачи для ссылок в переписке. */
  keyFor(prefix: string, number: number): string {
    return workTaskKey(prefix, number);
  }
}
