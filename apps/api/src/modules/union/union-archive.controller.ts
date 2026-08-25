import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionArchiveService } from './union-archive.service';

/**
 * Свой контроллер, а не маршруты внутри `union/swipes`: архив — не решение
 * о человеке, а изъятие его из выдачи, и жить под чужим префиксом ему
 * незачем.
 */
@Controller('union/archive')
@UseGuards(AuthGuard)
export class UnionArchiveController {
  constructor(private readonly archive: UnionArchiveService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.archive.list(user.sub);
  }

  @Post(':userId')
  @HttpCode(204)
  async add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.archive.archive(user.sub, userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.archive.restore(user.sub, userId);
  }
}
