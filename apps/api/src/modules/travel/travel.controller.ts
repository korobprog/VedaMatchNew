import {
  Body,
  Controller,
  Get,
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

  @Post('bookings/:id/cancel')
  cancel(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.travel.cancelBooking(user.sub, id);
  }
}
