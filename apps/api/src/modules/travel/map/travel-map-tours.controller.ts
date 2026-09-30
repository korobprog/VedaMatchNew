import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { TravelMapToursService } from './travel-map-tours.service';

/** Наборы на экскурсии: смотреть и записываться может любой вошедший. */
@Controller('travel/map/tours')
@UseGuards(AuthGuard)
export class TravelMapToursController {
  constructor(private readonly tours: TravelMapToursService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: Record<string, unknown>,
  ) {
    return this.tours.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.tours.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.tours.update(user, id, body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.cancel(user, id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.complete(user, id);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.join(user, id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.leave(user, id);
  }

  @Post(':id/group')
  @HttpCode(200)
  group(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.tours.openGroup(user, id);
  }
}
