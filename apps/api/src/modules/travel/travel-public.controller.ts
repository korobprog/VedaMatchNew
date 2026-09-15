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
import type { AccessTokenPayload } from '@vedamatch/shared';
import { OptionalAuthGuard, OptionalUser } from '../auth/auth.guard';
import { TravelService } from './travel.service';

/**
 * Страница объекта по QR — открывается без входа. Вошедший человек подаёт
 * отсюда обычную заявку, гость — заявку с токеном привязки.
 */
@Controller('travel/public')
@UseGuards(OptionalAuthGuard)
export class TravelPublicController {
  constructor(private readonly travel: TravelService) {}

  @Get('stays/:code')
  stay(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Param('code') code: string,
  ) {
    return this.travel.publicStay(code, user?.sub ?? null);
  }

  @Get('stays/:code/reviews')
  reviews(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Param('code') code: string,
  ) {
    return this.travel.publicStayReviews(code, user?.sub ?? null);
  }

  @Get('stays/:code/occupancy')
  occupancy(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.travel.publicOccupancy(code, user?.sub ?? null, from, to);
  }

  /**
   * Строже, чем заявка из кабинета: адрес открыт всем, а заявка пишет
   * хозяину в колокольчик.
   */
  @Post('bookings')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  create(
    @OptionalUser() user: AccessTokenPayload | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.travel.createGuestBooking(user?.sub ?? null, body);
  }
}
