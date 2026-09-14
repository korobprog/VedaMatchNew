import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  TravelStayKind,
  TravelStayPayment,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TravelService } from './travel.service';

/**
 * Сервис «Путешествия», раздел «Ночлег». Префикс маршрутов — слаг сервиса,
 * как требует контракт сервисного модуля.
 */
@Controller('travel')
@UseGuards(AuthGuard)
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  /** Точки на карте. */
  @Get('places')
  places() {
    return this.travel.places();
  }

  @Get('stays')
  stays(
    @Query('placeId') placeId?: string,
    @Query('kind') kind?: TravelStayKind,
    @Query('payment') payment?: TravelStayPayment,
  ) {
    return this.travel.stays({ placeId, kind, payment });
  }

  /** Свои заявки. Буквальный путь — раньше параметрического `stays/:id`. */
  @Get('bookings')
  myBookings(@CurrentUser() user: AccessTokenPayload) {
    return this.travel.myBookings(user.sub);
  }

  @Get('stays/:id')
  stay(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.travel.stay(id, user.sub);
  }

  /**
   * Заявка на ночлег. Ограничение частоты — как у заявок Рынка: заявка пишет
   * человеку в колокольчик, и без него один клик мог бы завалить хозяина.
   */
  @Post('bookings')
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.travel.createBooking(user.sub, body);
  }

  @Get('stays/:id/reviews')
  reviews(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.travel.stayReviews(id, user.sub);
  }

  /** Отзыв по своей заявке: создать или поправить. */
  @Put('bookings/:id/review')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  saveReview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.travel.saveReview(user.sub, id, body);
  }

  @Delete('bookings/:id/review')
  @HttpCode(204)
  async removeReview(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.travel.removeReview(user.sub, id);
  }

  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.travel.cancelBooking(user.sub, id);
  }
}
