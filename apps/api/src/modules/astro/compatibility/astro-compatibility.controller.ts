import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AstroCompatibilityReadingDto,
  AstroCompatibilityRequestDto,
  CreateAstroCompatibilityRequest,
  RespondAstroCompatibilityRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../../auth/auth.guard';
import { AstroCompatibilityService } from './astro-compatibility.service';

@Controller('astro/compatibility')
@UseGuards(AuthGuard)
export class AstroCompatibilityController {
  constructor(private readonly compatibility: AstroCompatibilityService) {}

  @Get('requests')
  list(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AstroCompatibilityRequestDto[]> {
    return this.compatibility.list(user.sub);
  }

  /** Точка входа из Union: карточка участника ведёт сюда с его userId. */
  @Post('requests')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateAstroCompatibilityRequest,
  ): Promise<AstroCompatibilityRequestDto> {
    // Цель приходит из карточки Знакомств вместе с намерением анкеты; её
    // отсутствие — семья, как было до появления целей.
    return this.compatibility.createRequest(
      user.sub,
      body.targetUserId,
      body.purpose,
    );
  }

  @Patch('requests/:id')
  respond(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: RespondAstroCompatibilityRequest,
  ): Promise<AstroCompatibilityRequestDto> {
    return this.compatibility.respond(user.sub, id, body.accept);
  }

  /**
   * Генерирует ИИ-разбор совместимости или отдаёт уже готовый из кэша. POST,
   * а не GET: первый вызов тратит квоту и обращается к провайдеру, это не
   * безопасное чтение — тот же принцип, что у `/astro/readings/:section`.
   */
  @Post('requests/:id/reading')
  reading(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AstroCompatibilityReadingDto> {
    return this.compatibility.reading(user.sub, id);
  }
}
