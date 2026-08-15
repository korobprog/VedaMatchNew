import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AddToMarketCartRequest,
  EditMarketMessageRequest,
  MarketCheckoutRequest,
  SendMarketMessageRequest,
  StartMarketChatRequest,
  UpdateMarketCartItemRequest,
  UpdateMarketOrderStatusRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { MarketCartService } from './market-cart.service';
import { MarketChatService } from './market-chat.service';
import { MarketOrdersService } from './market-orders.service';

@Controller('market/cart')
@UseGuards(AuthGuard)
export class MarketCartController {
  constructor(private readonly cart: MarketCartService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.get(user.sub);
  }

  /** Питает бейдж в шапке, поэтому дёргается часто и лимит здесь щедрый. */
  @Get('count')
  async count(@CurrentUser() user: AccessTokenPayload) {
    return { count: await this.cart.count(user.sub) };
  }

  @Post('items')
  @Throttle({ default: { ttl: 3_600_000, limit: 300 } })
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: AddToMarketCartRequest,
  ) {
    return this.cart.add(user.sub, body);
  }

  @Patch('items/:listingId')
  @Throttle({ default: { ttl: 3_600_000, limit: 300 } })
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('listingId') listingId: string,
    @Body() body: UpdateMarketCartItemRequest,
  ) {
    return this.cart.updateQuantity(user.sub, listingId, body.quantity);
  }

  @Delete('items/:listingId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('listingId') listingId: string,
  ) {
    return this.cart.remove(user.sub, listingId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: AccessTokenPayload) {
    await this.cart.clear(user.sub);
  }

  @Post('checkout')
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  checkout(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: MarketCheckoutRequest,
  ) {
    return this.cart.checkout(user.sub, body);
  }
}

@Controller('market/orders')
@UseGuards(AuthGuard)
export class MarketOrdersController {
  constructor(private readonly orders: MarketOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.orders.list(user.sub, { role, status, cursor });
  }

  @Get(':id')
  byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.orders.byId(user.sub, isAdmin(user), id);
  }

  @Post(':id/status')
  // Обновление, а не создание: POST здесь потому, что смена статуса —
  // действие, а не правка полей.
  @HttpCode(200)
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateMarketOrderStatusRequest,
  ) {
    return this.orders.setStatus(user.sub, isAdmin(user), id, body);
  }
}

@Controller('market/chats')
@UseGuards(AuthGuard)
export class MarketChatController {
  constructor(private readonly chat: MarketChatService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.chat.list(user.sub);
  }

  @Get('unread')
  async unread(@CurrentUser() user: AccessTokenPayload) {
    return { count: await this.chat.unreadTotal(user.sub) };
  }

  @Post()
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: StartMarketChatRequest,
  ) {
    return this.chat.start(user.sub, body);
  }

  @Get(':id')
  open(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.chat.open(user.sub, id);
  }

  @Post(':id/messages')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  send(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SendMarketMessageRequest,
  ) {
    return this.chat.send(user.sub, id, body);
  }

  @Patch(':id/messages/:messageId')
  @Throttle({ default: { ttl: 3_600_000, limit: 120 } })
  edit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() body: EditMarketMessageRequest,
  ) {
    return this.chat.edit(user.sub, id, messageId, body);
  }
}
