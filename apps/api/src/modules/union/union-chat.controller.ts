import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  UnionSendChatMessageRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { UnionChatService } from './union-chat.service';

@Controller('union/chats')
@UseGuards(AuthGuard)
export class UnionChatController {
  constructor(private readonly chats: UnionChatService) {}

  @Get(':id')
  getChat(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.chats.getChat(user.sub, id);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UnionSendChatMessageRequest,
  ) {
    return this.chats.sendMessage(user.sub, id, body);
  }
}
