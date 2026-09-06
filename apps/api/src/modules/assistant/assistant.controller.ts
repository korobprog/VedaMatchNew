import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccessTokenPayload,
  AssistantComposeRequest,
  AssistantComposeResponse,
  AssistantStateDto,
  AssistantThreadDetail,
  AssistantThreadDto,
  ConfirmAssistantActionRequest,
  ConfirmAssistantActionResponse,
  SendAssistantMessageRequest,
  SendAssistantMessageResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AssistantService } from './assistant.service';

/** Каждый вопрос — платный запрос к модели: лимит на ввод жёстче общего. */
const ASK_THROTTLE = { default: { ttl: 60_000, limit: 20 } };

@Controller('assistant')
@UseGuards(AuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('state')
  state(@CurrentUser() user: AccessTokenPayload): Promise<AssistantStateDto> {
    return this.assistant.state(user.sub);
  }

  @Post('threads')
  createThread(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AssistantThreadDto> {
    return this.assistant.createThread(user.sub);
  }

  @Get('threads/:id')
  thread(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AssistantThreadDetail> {
    return this.assistant.thread(user.sub, id);
  }

  @Delete('threads/:id')
  @HttpCode(204)
  async deleteThread(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assistant.deleteThread(user.sub, id);
  }

  /** Вопрос в новую нить: она создаётся по ходу. */
  @Post('messages')
  @Throttle(ASK_THROTTLE)
  ask(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SendAssistantMessageRequest,
  ): Promise<SendAssistantMessageResponse> {
    return this.assistant.send(user, null, body?.text);
  }

  @Post('threads/:id/messages')
  @Throttle(ASK_THROTTLE)
  send(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SendAssistantMessageRequest,
  ): Promise<SendAssistantMessageResponse> {
    return this.assistant.send(user, id, body?.text);
  }

  @Post('threads/:id/actions')
  confirm(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: ConfirmAssistantActionRequest,
  ): Promise<ConfirmAssistantActionResponse> {
    return this.assistant.confirmAction(user, id, {
      messageId: String(body?.messageId ?? ''),
      index: Number(body?.index ?? -1),
      confirm: body?.confirm !== false,
    });
  }

  /** Помощник в поле ввода «Общения». */
  @Post('compose')
  @Throttle(ASK_THROTTLE)
  compose(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: AssistantComposeRequest,
  ): Promise<AssistantComposeResponse> {
    return this.assistant.compose(user, body ?? { text: '' });
  }
}
