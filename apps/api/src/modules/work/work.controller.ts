import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateWorkBoardRequest,
  CreateWorkChecklistItemRequest,
  CreateWorkColumnRequest,
  CreateWorkCommentRequest,
  CreateWorkInviteRequest,
  CreateWorkLabelRequest,
  CreateWorkSpaceRequest,
  CreateWorkTaskRequest,
  MoveWorkTaskRequest,
  UpdateWorkBoardRequest,
  UpdateWorkChecklistItemRequest,
  UpdateWorkColumnRequest,
  UpdateWorkMemberRequest,
  UpdateWorkSpaceRequest,
  UpdateWorkTaskRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { WorkBoardsService } from './work-boards.service';
import { WorkContactsService } from './work-contacts.service';
import { WorkInvitesService } from './work-invites.service';
import { WorkSpacesService } from './work-spaces.service';
import { WorkTasksService } from './work-tasks.service';
import { MAX_WORK_FILE_BYTES } from './work-upload-rules';
import type { UploadedWorkFile } from './work-uploads.service';

/**
 * Приглашения. Отдельный контроллер и первый в модуле: у `WorkController`
 * есть `@Get('spaces/:id')`, а буквальные пути обязаны регистрироваться
 * раньше параметрических — тот же порядок, что у «Объявлений».
 *
 * `join/:token` — единственный маршрут сервиса, открытый гостю: человек
 * должен увидеть, куда его зовут, до того как заводить аккаунт.
 */
@Controller('work')
export class WorkInvitesController {
  constructor(private readonly invites: WorkInvitesService) {}

  @Get('join/:token')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  preview(
    @Param('token') token: string,
    @OptionalUser() user: AccessTokenPayload | undefined,
  ) {
    return this.invites.preview(token, user?.sub ?? null);
  }

  @Post('join/:token')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.invites.accept(token, user.sub);
  }

  @Delete('invites/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.invites.revoke(id, user.sub);
  }
}

/** Рабочие среды, участники и приглашения в них. */
@Controller('work')
@UseGuards(AuthGuard)
export class WorkController {
  constructor(
    private readonly spaces: WorkSpacesService,
    private readonly invites: WorkInvitesService,
    private readonly tasks: WorkTasksService,
    private readonly contacts: WorkContactsService,
  ) {}

  @Get('spaces')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.spaces.list(user.sub);
  }

  @Post('spaces')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  create(
    @Body() body: CreateWorkSpaceRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.spaces.create(user.sub, body);
  }

  /** Личная среда «Мои дела»: заводится при первом заходе в Планировщик. */
  @Post('spaces/personal')
  personal(@CurrentUser() user: AccessTokenPayload) {
    return this.spaces.ensurePersonal(user.sub);
  }

  @Get('agenda')
  agenda(@CurrentUser() user: AccessTokenPayload) {
    return this.tasks.agenda(user.sub);
  }

  @Get('spaces/:id')
  get(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.spaces.get(id, user.sub);
  }

  @Patch('spaces/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWorkSpaceRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.spaces.update(id, user.sub, body);
  }

  @Delete('spaces/:id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.spaces.remove(id, user.sub);
  }

  @Patch('spaces/:id/members/:userId')
  @HttpCode(204)
  async setRole(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: UpdateWorkMemberRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.spaces.setMemberRole(id, user.sub, targetUserId, body.role);
  }

  @Delete('spaces/:id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.spaces.removeMember(id, user.sub, targetUserId);
  }

  @Post('spaces/:id/members/:userId/owner')
  @HttpCode(204)
  async transfer(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.spaces.transferOwnership(id, user.sub, targetUserId);
  }

  @Get('spaces/:id/invites')
  listInvites(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.invites.list(id, user.sub);
  }

  /**
   * Кого можно позвать: знакомые из портального графа, а администрации —
   * весь портал. Где именно искали, сказано в ответе полем `scope`.
   */
  @Get('spaces/:id/contacts')
  listContacts(
    @Param('id') id: string,
    @Query('query') query: string | undefined,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.contacts.listFor(id, user.sub, query);
  }

  @Post('spaces/:id/invites')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createInvite(
    @Param('id') id: string,
    @Body() body: CreateWorkInviteRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.invites.create(id, user.sub, body);
  }
}

/** Доски, колонки и метки. */
@Controller('work')
@UseGuards(AuthGuard)
export class WorkBoardsController {
  constructor(private readonly boards: WorkBoardsService) {}

  @Post('spaces/:id/boards')
  createBoard(
    @Param('id') spaceId: string,
    @Body() body: CreateWorkBoardRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.createBoard(spaceId, user.sub, body);
  }

  @Post('spaces/:id/labels')
  createLabel(
    @Param('id') spaceId: string,
    @Body() body: CreateWorkLabelRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.createLabel(spaceId, user.sub, body);
  }

  @Delete('labels/:id')
  @HttpCode(204)
  async removeLabel(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.boards.removeLabel(id, user.sub);
  }

  // Доску открывают чаще, чем что угодно другое в сервисе: лимит выше общего.
  @Get('boards/:id')
  @Throttle({ default: { ttl: 60_000, limit: 180 } })
  board(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.boards.board(id, user.sub);
  }

  @Patch('boards/:id')
  updateBoard(
    @Param('id') id: string,
    @Body() body: UpdateWorkBoardRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.updateBoard(id, user.sub, body);
  }

  @Delete('boards/:id')
  @HttpCode(204)
  async removeBoard(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.boards.removeBoard(id, user.sub);
  }

  @Post('boards/:id/columns')
  createColumn(
    @Param('id') id: string,
    @Body() body: CreateWorkColumnRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.createColumn(id, user.sub, body);
  }

  @Patch('columns/:id')
  updateColumn(
    @Param('id') id: string,
    @Body() body: UpdateWorkColumnRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.updateColumn(id, user.sub, body);
  }

  @Delete('columns/:id')
  removeColumn(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.boards.removeColumn(id, user.sub);
  }
}

/** Задачи: карточка, перенос, обсуждение, чек-лист. */
@Controller('work')
@UseGuards(AuthGuard)
export class WorkTasksController {
  constructor(private readonly tasks: WorkTasksService) {}

  @Post('boards/:id/tasks')
  create(
    @Param('id') boardId: string,
    @Body() body: CreateWorkTaskRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.create(boardId, user.sub, body);
  }

  @Get('tasks/:id')
  get(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.tasks.get(id, user.sub);
  }

  @Patch('tasks/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateWorkTaskRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.update(id, user.sub, body);
  }

  // Перетаскивание — самое частое действие на доске, и лимит на него отдельный:
  // час бана за десять переносов подряд был бы абсурдом.
  @Post('tasks/:id/move')
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  move(
    @Param('id') id: string,
    @Body() body: MoveWorkTaskRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.move(id, user.sub, body);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    await this.tasks.archive(id, user.sub);
  }

  @Post('tasks/:id/comments')
  comment(
    @Param('id') id: string,
    @Body() body: CreateWorkCommentRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.addComment(id, user.sub, body);
  }

  @Post('tasks/:id/checklist')
  addChecklistItem(
    @Param('id') id: string,
    @Body() body: CreateWorkChecklistItemRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.addChecklistItem(id, user.sub, body);
  }

  @Patch('checklist/:id')
  updateChecklistItem(
    @Param('id') id: string,
    @Body() body: UpdateWorkChecklistItemRequest,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.updateChecklistItem(id, user.sub, body);
  }

  @Delete('checklist/:id')
  removeChecklistItem(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.removeChecklistItem(id, user.sub);
  }

  /**
   * Вложение: файл уезжает в S3, в карточку возвращается подписанная ссылка.
   *
   * Лимит интерцептора — по самому большому допустимому типу; свой предел для
   * картинки проверяет `validateWorkUpload` уже по MIME. Отдельный лимит на
   * частоту: доску заполняют скриншотами пачкой, и общий лимит запросов
   * банил бы за нормальную работу.
   */
  @Post('tasks/:id/attachments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_WORK_FILE_BYTES } }),
  )
  addAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file?: UploadedWorkFile,
  ) {
    return this.tasks.addAttachment(id, user.sub, file);
  }

  @Delete('attachments/:id')
  removeAttachment(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.tasks.removeAttachment(id, user.sub);
  }
}
