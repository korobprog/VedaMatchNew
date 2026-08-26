import { Controller, Get } from '@nestjs/common';
import { UnionShowcaseService } from './union-showcase.service';

/**
 * Единственный маршрут Union без `AuthGuard`: витрину показывает публичная
 * страница сервиса, до входа. Guard здесь не забыт — его отсутствие и есть
 * смысл контроллера, поэтому витрина живёт отдельно от остальных маршрутов,
 * а не методом в защищённом контроллере, где легко потерять исключение.
 *
 * Наружу уходят только анкеты тех, кто отметил согласие на публичный показ,
 * — отбор в `toShowcaseDraft`.
 */
@Controller('union')
export class UnionShowcaseController {
  constructor(private readonly showcase: UnionShowcaseService) {}

  @Get('showcase')
  cards() {
    return this.showcase.showcase();
  }
}
