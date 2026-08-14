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
import type {
  AccessTokenPayload,
  AdminBlockUserRequest,
  AdminDeleteUserRequest,
  AdminManualStageUpdateRequest,
  AdminRoleUpdateRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminUsersService } from './admin-users.service';
import { UsersService } from './users.service';

@Controller('admin/users')
@UseGuards(AuthGuard)
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly users: UsersService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.adminUsers.listUsers(user.role, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.adminUsers.getUser(user.role, id);
  }

  @Patch(':id/photo-verification')
  setPhotoVerification(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { verified?: boolean },
  ) {
    return this.users.setPhotoVerification(
      user.role,
      id,
      body?.verified === true,
    );
  }

  @Patch(':id/stage')
  updateStage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminManualStageUpdateRequest,
  ) {
    return this.adminUsers.updateStage(user, id, body);
  }

  @Patch(':id/role')
  updateRole(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminRoleUpdateRequest,
  ) {
    return this.adminUsers.updateRole(user, id, body);
  }

  @Patch(':id/block')
  setBlocked(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminBlockUserRequest,
  ) {
    return this.adminUsers.setBlocked(user, id, body);
  }

  @Post(':id/delete')
  softDelete(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: AdminDeleteUserRequest,
  ) {
    return this.adminUsers.softDeleteUser(user, id, body);
  }

  @Post(':id/restore')
  restore(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    return this.adminUsers.restoreUser(user, id);
  }
}
