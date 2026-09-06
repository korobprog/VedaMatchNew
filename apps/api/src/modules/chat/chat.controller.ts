import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  CreateChatConversationRequest,
  CreateChatReportRequest,
  EditChatMessageRequest,
  SaveChatColorTemplateRequest,
  SendChatMessageRequest,
  SetChatConversationThemeRequest,
  SetChatReactionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminUnlimited } from '../auth/admin-unlimited.guard';
import {
  ChatSignedUrlsInterceptor,
  RawStorageUrls,
} from './chat-signed-urls.interceptor';
import { ChatColorTemplatesService } from './chat-color-templates.service';
import { ChatConversationThemeService } from './chat-conversation-theme.service';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatReportsService } from './chat-reports.service';
import { PeopleService } from './people/people.service';
import { MAX_FILE_BYTES, validateUpload } from './chat-upload-rules';
import {
  ChatUploadsService,
  type UploadedChatFile,
} from './chat-uploads.service';

@Controller('chat')
@UseGuards(AuthGuard)
@UseInterceptors(ChatSignedUrlsInterceptor)
export class ChatController {
  constructor(
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
    private readonly reports: ChatReportsService,
    private readonly uploads: ChatUploadsService,
    private readonly directory: PeopleService,
    private readonly colorTemplates: ChatColorTemplatesService,
    private readonly conversationTheme: ChatConversationThemeService,
  ) {}

  @Get('conversations')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.list(user.sub);
  }

  @Get('requests')
  requests(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.requests(user.sub);
  }

  /**
   * «Избранное». Идемпотентно: заводит беседу при первом обращении и дальше
   * возвращает ту же — страница `/chat/saved` на этом и держится.
   */
  @Post('saved')
  saved(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.saved(user.sub);
  }

  /** Люди, из которых собирается группа: собеседники личных диалогов. */
  @Get('people')
  people(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.people(user.sub);
  }

  /** Общины, где смотрящий вправе завести канал. */
  @Get('channel-communities')
  channelCommunities(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.channelCommunities(user.sub);
  }

  /** Значок на плитке сервиса: сколько непрочитанного и запросов. */
  @Get('unread')
  unread(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.unread(user.sub);
  }

  /**
   * Карта: общины с их открытыми беседами и города со счётчиком людей.
   *
   * Люди попадают сюда только по своему согласию (`showOnMap` в карточке
   * справочника) и только числом на город — метка ставится в его центр, а не
   * по адресу человека.
   */
  @Get('map')
  async map(@CurrentUser() user: AccessTokenPayload) {
    return this.conversations.map(await this.directory.mapCities(user.sub));
  }

  /** Каталог открытых бесед: чаты и каналы, куда можно войти самому. */
  @Get('discover')
  discover(
    @CurrentUser() user: AccessTokenPayload,
    @Query('q') query?: string,
    @Query('communityId') communityId?: string,
  ) {
    return this.conversations.discover(user.sub, query, communityId);
  }

  /** Поиск по своим перепискам. */
  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@CurrentUser() user: AccessTokenPayload, @Query('q') query?: string) {
    return this.conversations.search(user.sub, query ?? '');
  }

  @Get('conversations/:id')
  detail(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Query('before') before?: string,
  ) {
    return this.conversations.detail(user.sub, id, before);
  }

  /**
   * Создание беседы ограничено: это главная дверь для спама. Админу лимит
   * не считается — он пишет пачками при разборе жалоб и модерации.
   */
  @Post('conversations')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @AdminUnlimited()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateChatConversationRequest,
  ) {
    return this.conversations.create(user.sub, body);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SendChatMessageRequest,
  ) {
    return this.messages.send(user.sub, id, body);
  }

  @Post('conversations/:id/accept')
  accept(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.accept(user.sub, id);
  }

  @Post('conversations/:id/decline')
  decline(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.decline(user.sub, id);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.markRead(user.sub, id);
  }

  /**
   * «Печатает…». Лимит выше остальных: клиент шлёт сигнал раз в несколько
   * секунд, пока человек набирает.
   */
  @Post('conversations/:id/typing')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  typing(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.typing(user.sub, id);
  }

  /** Heartbeat «беседа открыта прямо сейчас» — подавляет пуш получателю,
   *  пока он реально смотрит в этот чат. Троттлинг как у «печатает…». */
  @Post('conversations/:id/presence')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  presence(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.presence(user.sub, id);
  }

  @Post('conversations/:id/mute')
  mute(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { muted?: boolean },
  ) {
    return this.conversations.setMuted(user.sub, id, body?.muted !== false);
  }

  @Post('conversations/:id/pin')
  pin(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { pinned?: boolean },
  ) {
    return this.conversations.setPinned(user.sub, id, body?.pinned !== false);
  }

  @Post('conversations/:id/subscribe')
  subscribe(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.subscribe(user.sub, id);
  }

  @Post('conversations/:id/members')
  addMembers(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { userIds?: string[] },
  ) {
    return this.conversations.addMembers(user.sub, id, body?.userIds ?? []);
  }

  @Delete('conversations/:id/members/:userId')
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('userId') targetId: string,
  ) {
    return this.conversations.removeMember(user.sub, id, targetId);
  }

  @Post('conversations/:id/members/:userId/role')
  setMemberRole(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('userId') targetId: string,
    @Body() body: { role?: 'admin' | 'member' },
  ) {
    return this.conversations.setMemberRole(
      user.sub,
      id,
      targetId,
      body?.role === 'admin' ? 'admin' : 'member',
    );
  }

  @Post('conversations/:id')
  updateConversation(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      avatarUrl?: string;
      avatarKey?: string;
      visibility?: 'public' | 'private';
    },
  ) {
    return this.conversations.updateConversation(user.sub, id, body ?? {});
  }

  /** Удалить группу или канал целиком: только владелец, только не диалог. */
  @Delete('conversations/:id')
  removeConversation(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.conversations.remove(user.sub, id);
  }

  @Delete('conversations/:id/members/me')
  leave(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.conversations.leave(user.sub, id);
  }

  /** Вложение: файл сначала уезжает в S3, ссылка потом идёт в сообщение. */
  @Post('conversations/:id/uploads')
  @RawStorageUrls()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  async upload(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @UploadedFile() file?: UploadedChatFile,
  ) {
    await this.conversations.requireConversation(id, user.sub);

    const denial = validateUpload(file);
    if (denial === 'unsupported_type')
      throw new UnsupportedMediaTypeException('Такой файл приложить нельзя');
    if (denial === 'file_too_large')
      throw new UnsupportedMediaTypeException('Файл слишком большой');

    if (!this.uploads.configured) {
      this.uploads.warnUnavailable(id);
      throw new ServiceUnavailableException('Загрузка файлов недоступна');
    }

    const stored = await this.uploads.store(id, file!);
    if (!stored) throw new ServiceUnavailableException('Файл не сохранён');
    return stored;
  }

  @Post('messages/:id/edit')
  edit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: EditChatMessageRequest,
  ) {
    return this.messages.edit(user.sub, id, body?.body ?? '');
  }

  @Delete('messages/:id')
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.messages.remove(user.sub, id);
  }

  /** Закрепить сообщение в беседе; `null` в теле снимает закрепление. */
  @Post('conversations/:id/pinned-message')
  pinMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { messageId?: string | null },
  ) {
    return this.conversations.pinMessage(user.sub, id, body?.messageId ?? null);
  }

  /** Пост канала со своими комментариями. */
  @Get('messages/:id/thread')
  thread(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.messages.thread(user.sub, id);
  }

  /** Отметить посты просмотренными: счётчик под постом канала. */
  @Post('views')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  markViewed(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { messageIds?: string[] },
  ) {
    return this.messages.markViewed(user.sub, body?.messageIds ?? []);
  }

  /** Переслать сообщение в другую беседу. */
  @Post('messages/:id/forward')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  forward(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { conversationId?: string },
  ) {
    if (!body?.conversationId)
      throw new BadRequestException('Не указана беседа');
    return this.messages.forward(user.sub, id, body.conversationId);
  }

  @Post('messages/:id/reaction')
  reaction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetChatReactionRequest,
  ) {
    return this.messages.setReaction(user.sub, id, body?.emoji ?? '');
  }

  @Post('reports')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateChatReportRequest,
  ) {
    return this.reports.create(user.sub, body);
  }

  @Get('color-templates')
  listColorTemplates(@CurrentUser() user: AccessTokenPayload) {
    return this.colorTemplates.list(user.sub);
  }

  @Post('color-templates')
  createColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveChatColorTemplateRequest,
  ) {
    return this.colorTemplates.create(user.sub, body);
  }

  @Post('color-templates/:id')
  updateColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SaveChatColorTemplateRequest,
  ) {
    return this.colorTemplates.update(user.sub, id, body);
  }

  @Delete('color-templates/:id')
  removeColorTemplate(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.colorTemplates.remove(user.sub, id);
  }

  @Get('conversations/:id/theme')
  getConversationTheme(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.conversationTheme.get(user.sub, id);
  }

  @Post('conversations/:id/theme')
  setConversationTheme(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SetChatConversationThemeRequest,
  ) {
    return this.conversationTheme.set(user.sub, id, body?.templateId ?? null);
  }
}
