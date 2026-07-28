import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AddSupportMessageRequest,
  AdminUpdateSupportTicketRequest,
  CreateSupportTicketRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { SupportService } from './support.service';

/** Публичная часть: обращения можно создавать и читать без авторизации. */
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // Форма открыта всему интернету: держим жёсткий лимит на создание.
  @Post()
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  create(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Body() body: CreateSupportTicketRequest,
  ) {
    return this.support.create(body, user);
  }

  @Get('track/:token')
  track(@Param('token') token: string) {
    return this.support.byTrackToken(token);
  }

  @Post('track/:token/messages')
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  guestMessage(
    @Param('token') token: string,
    @Body() body: AddSupportMessageRequest,
  ) {
    return this.support.addGuestMessage(token, body);
  }
}

/** Кабинет: список обращений пользователя и переписка. */
@Controller('support/my/tickets')
@UseGuards(AuthGuard)
export class MySupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.support.listMine(user.sub);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.support.getMine(user.sub, id);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  message(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddSupportMessageRequest,
  ) {
    return this.support.addUserMessage(user.sub, id, body);
  }
}

@Controller('admin/support/tickets')
@UseGuards(AuthGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(
    @CurrentUser() admin: AccessTokenPayload,
    @Query('status') status?: string,
  ) {
    return this.support.adminList(admin.role, status);
  }

  @Get(':id')
  get(@CurrentUser() admin: AccessTokenPayload, @Param('id') id: string) {
    return this.support.adminGet(admin.role, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminUpdateSupportTicketRequest,
  ) {
    return this.support.adminUpdate(admin, id, body);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AddSupportMessageRequest,
  ) {
    return this.support.adminReply(admin, id, body);
  }
}
