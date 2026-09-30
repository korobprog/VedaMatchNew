import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { TravelMapGuidesService } from './travel-map-guides.service';

/** Экскурсоводы: читает любой вошедший, свой профиль ведёт сам человек. */
@Controller('travel/map/guides')
@UseGuards(AuthGuard)
export class TravelMapGuidesController {
  constructor(private readonly guides: TravelMapGuidesService) {}

  @Get()
  list() {
    return this.guides.list();
  }

  // `me` объявлен раньше `:userId`, иначе «me» разберётся как id.
  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.guides.me(user);
  }

  @Put('me')
  upsertMe(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.guides.upsertMe(user, body);
  }

  @Delete('me')
  @HttpCode(204)
  async removeMe(@CurrentUser() user: AccessTokenPayload) {
    await this.guides.removeMe(user);
  }

  @Get(':userId')
  get(@Param('userId') userId: string) {
    return this.guides.get(userId);
  }
}
