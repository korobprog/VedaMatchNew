import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  ContactsCreateRequestBody,
  ContactsRespondBody,
  ContactsUpdateProfileRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ContactsRequestsService } from './contacts-requests.service';
import { ContactsService } from './contacts.service';

/**
 * Справочник доступен только авторизованным: каталог вайшнавов с городами
 * не должен быть открыт наружу.
 */
@Controller('contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly requests: ContactsRequestsService,
  ) {}

  @Get('profile')
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.contacts.getState(user.sub);
  }

  @Put('profile')
  upsert(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ContactsUpdateProfileRequest,
  ) {
    return this.contacts.upsertProfile(user.sub, body);
  }

  @Get('tags')
  tags() {
    return this.contacts.listTags();
  }

  /**
   * Поиск по справочнику. Списочные параметры (`stages`, `ashram`, `tagIds`,
   * `languages`) принимаются и повторением ключа (`?tagIds=a&tagIds=b`),
   * и через запятую (`?tagIds=a,b`) — разбор один и тот же.
   */
  @Get('search')
  search(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.contacts.search(user.sub, query);
  }

  @Get('users/:id')
  card(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.contacts.getCard(user.sub, id);
  }

  @Get('requests')
  requestsList(@CurrentUser() user: AccessTokenPayload) {
    return this.requests.list(user.sub);
  }

  @Post('requests')
  createRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: ContactsCreateRequestBody,
  ) {
    return this.requests.create(user.sub, body);
  }

  @Post('requests/:id/respond')
  respond(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ContactsRespondBody,
  ) {
    return this.requests.respond(user.sub, id, body);
  }

  /** Отправитель отзывает свой ещё не рассмотренный запрос. */
  @Delete('requests/:id')
  cancelRequest(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.requests.cancel(user.sub, id);
  }

  @Get('disclosures')
  disclosures(@CurrentUser() user: AccessTokenPayload) {
    return this.requests.listDisclosures(user.sub);
  }

  /** Отзыв доступа: строка остаётся в журнале с датой отзыва. */
  @Delete('disclosures/:id')
  revokeDisclosure(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.requests.revokeDisclosure(user.sub, id);
  }
}
