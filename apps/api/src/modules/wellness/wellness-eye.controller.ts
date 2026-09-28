import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import {
  EyeInputError,
  parseEyeFrame,
  parseEyeMode,
  type EyeMode,
} from './eye-vision';
import { WellnessEyeService } from './wellness-eye.service';

/**
 * «Третий глаз» — помощник для человека с плохим зрением: камера смотрит,
 * телефон говорит, что видит. Средство раздела «Здоровье», поэтому маршрут
 * под слагом сервиса.
 *
 * Кадр нигде не сохраняется и в историю не пишется: это не снимок, который
 * человек решил отправить, а поток с камеры, и на сервере ему делать нечего
 * дольше одного запроса.
 */
@Controller('wellness/eye')
@UseGuards(AuthGuard)
export class WellnessEyeController {
  constructor(private readonly eye: WellnessEyeService) {}

  /**
   * Один кадр. Лимит под живой режим: телефон шлёт кадр не чаще раза в
   * полторы секунды и только когда предыдущий ответ уже пришёл — 40 в минуту
   * с запасом покрывают это и режут сломанный клиент, который шлёт без пауз.
   */
  @Post('look')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  // `previous` (прошлую фразу) первая сборка приложения ещё присылает, но
  // модели она больше не уходит: с ней модель повторяла старую фразу слово
  // в слово, хотя в кадре уже был автобус. Повторы отсекает телефон.
  async look(@Body() body: { mode?: unknown; imageDataUrl?: unknown }) {
    let mode: EyeMode;
    let image: string;
    try {
      mode = parseEyeMode(body.mode);
      image = parseEyeFrame(body.imageDataUrl);
    } catch (error) {
      if (error instanceof EyeInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.eye.look(mode, image);
  }
}
