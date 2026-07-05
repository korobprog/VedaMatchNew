import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  UnionCreateConnectionRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionConnectionService } from './union-connection.service';

@Controller('union/connection-requests')
@UseGuards(AuthGuard)
export class UnionConnectionController {
  constructor(private readonly connections: UnionConnectionService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.connections.list(user.sub);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UnionCreateConnectionRequest,
  ) {
    return this.connections.create(user.sub, body);
  }

  @Patch(':id/accept')
  accept(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.connections.accept(user.sub, id);
  }

  @Patch(':id/decline')
  decline(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.connections.decline(user.sub, id);
  }
}
