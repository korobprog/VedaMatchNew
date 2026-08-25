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
import { UnionFavoritesService } from './union-favorites.service';

@Controller('union/favorites')
@UseGuards(AuthGuard)
export class UnionFavoritesController {
  constructor(private readonly favorites: UnionFavoritesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.favorites.list(user.sub);
  }

  @Post(':userId')
  @HttpCode(204)
  async add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.favorites.add(user.sub, userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    await this.favorites.remove(user.sub, userId);
  }
}
