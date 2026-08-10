import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import type {
  AccessTokenPayload,
  AstroStateDto,
  SaveAstroBirthDataRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroBirthDataService } from './astro-birth-data.service';
import { resolveTimezone } from './birth-moment';

@Controller('astro/birth-data')
@UseGuards(AuthGuard)
export class AstroBirthDataController {
  constructor(private readonly birthData: AstroBirthDataService) {}

  @Get()
  state(@CurrentUser() user: AccessTokenPayload): Promise<AstroStateDto> {
    return this.birthData.state(user.sub);
  }

  @Put()
  save(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: SaveAstroBirthDataRequest,
  ): Promise<AstroStateDto> {
    return this.birthData.save(user.sub, body);
  }

  /**
   * Часовой пояс по координатам. Место человек выбирает через общий портальный
   * `/geo/search`, а зону подставляем здесь — она нужна только астрологии.
   * Отдельный запрос, чтобы онбординг показал пояс до сохранения: приграничные
   * места и историческое декретное время человек должен увидеть и подтвердить.
   */
  @Get('timezone')
  timezone(@Query('lat') lat: string, @Query('lon') lon: string) {
    return { timezone: resolveTimezone(Number(lat), Number(lon)) };
  }
}
