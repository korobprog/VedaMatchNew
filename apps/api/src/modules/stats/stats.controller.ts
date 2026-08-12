import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

/** Единственный намеренно публичный контроллер: без него лендинг для
 *  неавторизованных гостей не может показать живое число участников. */
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('community')
  community() {
    return this.stats.communityStats();
  }
}
