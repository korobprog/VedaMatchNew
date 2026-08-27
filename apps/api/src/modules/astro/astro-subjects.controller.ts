import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  AstroSubjectDto,
  AstroSubjectsDto,
  AstroSubjectPairDto,
  SaveAstroSubjectRequest,
  VedicChart,
} from '@vedamatch/shared';
import { ASTRO_COMPATIBILITY_PURPOSES } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroChartService } from './astro-chart.service';
import { AstroSubjectsService } from './astro-subjects.service';
import { AstroCompatibilityService } from './compatibility/astro-compatibility.service';

/**
 * Записи астролога. Владелец берётся из токена и никогда из тела запроса:
 * иначе чужой ownerId в JSON открывал бы доступ к чужим картам.
 */
@Controller('astro/subjects')
@UseGuards(AuthGuard)
export class AstroSubjectsController {
  constructor(
    private readonly subjects: AstroSubjectsService,
    private readonly charts: AstroChartService,
    private readonly compatibility: AstroCompatibilityService,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload): Promise<AstroSubjectsDto> {
    return this.subjects.list(user.sub);
  }

  @Get(':id')
  one(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<AstroSubjectDto> {
    return this.subjects.get(user.sub, id);
  }

  /** Карта записи: тот же расчёт, что у своей, только момент из другой строки. */
  @Get(':id/chart')
  chart(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<VedicChart> {
    return this.charts.subjectChart(user.sub, id);
  }

  /**
   * Сверка двух записей. Обе принадлежат спрашивающему, поэтому согласия
   * здесь нет — оно нужно там, где данные принадлежат разным людям.
   */
  @Get(':id/compare/:otherId')
  compare(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('otherId') otherId: string,
    @Query('purpose') purpose?: string,
  ): Promise<AstroSubjectPairDto> {
    // Непонятная цель — не повод считать неизвестно ради чего: молча берём
    // семейный счёт, как и везде по умолчанию.
    const known = ASTRO_COMPATIBILITY_PURPOSES.find((p) => p === purpose);
    return this.compatibility.compareSubjects(user.sub, id, otherId, known);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveAstroSubjectRequest,
  ): Promise<AstroSubjectDto> {
    return this.subjects.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: SaveAstroSubjectRequest,
  ): Promise<AstroSubjectDto> {
    return this.subjects.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<{ ok: true }> {
    return this.subjects.remove(user.sub, id);
  }
}
