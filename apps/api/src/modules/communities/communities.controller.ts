import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AdminCommunityDecisionRequest,
  CreateCommunityRequest,
  CreateTransferRequest,
  JoinCommunityRequest,
  RespondToMemberRequest,
  UpdateCommunityRequest,
  UpdateMemberRequest,
  UpdateMembershipRequest,
} from '@vedamatch/shared';
import {
  AuthGuard,
  CurrentUser,
  OptionalAuthGuard,
  OptionalUser,
} from '../auth/auth.guard';
import { CommunitiesService } from './communities.service';
import { CommunityMembersService } from './community-members.service';
import { isAdmin } from './is-admin';

@Controller('communities')
export class CommunitiesController {
  constructor(
    private readonly communities: CommunitiesService,
    private readonly members: CommunityMembersService,
  ) {}

  // Справочник открыт гостю и живёт под послабленным лимитом чтения:
  // фильтры на выдаче переключают часто, и бан за перебор был бы абсурдом.
  @Get()
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  search(
    @Query() query: Record<string, string | undefined>,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.communities.search(query, user?.sub);
  }

  @Get('map')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  map(@Query() query: Record<string, string | undefined>) {
    return this.communities.map(query);
  }

  // Свои общины — до `:slug`, иначе `me` уедет в поиск по слагу.
  @Get('me')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.communities.myCommunities(user.sub);
  }

  @Get('transfers/incoming')
  @UseGuards(AuthGuard)
  incomingTransfers(@CurrentUser() user: AccessTokenPayload) {
    return this.members.listIncomingTransfers(user.sub);
  }

  @Post()
  @UseGuards(AuthGuard)
  // Заводить общины пачками незачем: их десятки на город, а разбирает заявки
  // живой человек.
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 3 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateCommunityRequest,
  ) {
    return this.communities.create(user.sub, body);
  }

  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  bySlug(
    @Param('slug') slug: string,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.communities.bySlug(
      slug,
      user?.sub,
      user ? isAdmin(user) : false,
    );
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateCommunityRequest,
  ) {
    return this.communities.update(user.sub, isAdmin(user), id, body);
  }

  // ===== Участники =====

  @Get(':id/members')
  @UseGuards(OptionalAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  members_(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @OptionalUser() user?: AccessTokenPayload,
  ) {
    return this.members.list(
      id,
      user?.sub,
      query,
      user ? isAdmin(user) : false,
    );
  }

  @Post(':id/join')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 20 } })
  join(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: JoinCommunityRequest,
  ) {
    return this.members.join(user.sub, id, body ?? {});
  }

  @Delete(':id/members/me')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  leave(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.members.leave(user.sub, id);
  }

  // Своё членство: значок в профиле, публичность, подпись служения.
  @Put(':id/members/me')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  updateOwnMembership(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMembershipRequest,
  ) {
    return this.members.updateOwn(user.sub, id, body);
  }

  @Post(':id/members/:userId/respond')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  respond(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: RespondToMemberRequest,
  ) {
    return this.members.respond(user.sub, id, targetUserId, body.accept);
  }

  @Put(':id/members/:userId')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  setRole(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: UpdateMemberRequest,
  ) {
    return this.members.setRole(user.sub, id, targetUserId, body);
  }

  @Delete(':id/members/:userId')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.members.remove(user.sub, id, targetUserId);
  }

  // ===== Передача владения =====

  @Post(':id/transfer')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 5 } })
  transfer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: CreateTransferRequest,
  ) {
    return this.members.createTransfer(user.sub, id, body.toUserId);
  }

  @Post('transfers/:id/respond')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @Throttle({ default: { ttl: 24 * 3_600_000, limit: 20 } })
  respondToTransfer(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: RespondToMemberRequest,
  ) {
    return this.members.respondToTransfer(user.sub, id, body.accept);
  }
}

/**
 * Разбор заявок на общины. Отдельный контроллер с портальным префиксом:
 * администрация портала, а не администрация общины.
 */
@Controller('admin/communities')
@UseGuards(AuthGuard)
export class AdminCommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, string | undefined>,
  ) {
    this.assertAdmin(user);
    return this.communities.adminList(query);
  }

  @Post(':id/decide')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminCommunityDecisionRequest,
  ) {
    this.assertAdmin(user);
    return this.communities.adminDecide(user.sub, id, body);
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
  }
}
