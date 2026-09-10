import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { normalizeBarcode } from './barcode';
import {
  parseProductInput,
  parseReportComment,
  parseRestrictions,
  parseScanInput,
  WellnessInputError,
} from './wellness-dto';
import { LabelImageError, parseImageDataUrl } from './label-recognition';
import { WellnessRecognizeService } from './wellness-recognize.service';
import { WellnessService } from './wellness.service';

/**
 * Сервис «Здоровье», раздел «Сканер». Префикс маршрутов — слаг сервиса, как
 * требует контракт сервисного модуля.
 */
@Controller('wellness')
@UseGuards(AuthGuard)
export class WellnessController {
  constructor(
    private readonly wellness: WellnessService,
    private readonly recognize: WellnessRecognizeService,
  ) {}

  /**
   * Снимок состава, когда штрихкод не читается — стёрт, смят или его нет.
   * Модель только читает буквы; вердикт считает наш код по справочнику.
   */
  @Post('recognize')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  async readLabel(@Body() body: { imageDataUrl?: unknown }) {
    let image: string;
    try {
      image = parseImageDataUrl(body.imageDataUrl);
    } catch (error) {
      if (error instanceof LabelImageError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const ingredientsRaw = await this.recognize.readLabel(image);
    return { ingredientsRaw };
  }

  /** Справочник ингредиентов: он же экран «что мы умеем находить». */
  @Get('ingredients')
  ingredients() {
    return this.wellness.catalogForUi();
  }

  @Get('diet')
  diet(@CurrentUser() user: AccessTokenPayload) {
    return this.wellness.diet(user.sub);
  }

  @Patch('diet')
  updateDiet(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.wellness.updateDiet(user.sub, parseRestrictions(body));
  }

  /**
   * Скан у полки: по штрихкоду или по снимку состава. Лимит щедрый — человек
   * в магазине проверяет полку, а не один продукт.
   */
  @Post('scan')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  scan(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.wellness.scan(
      user.sub,
      this.parse(() => parseScanInput(body)),
    );
  }

  @Get('products/by-barcode/:code')
  async byBarcode(
    @CurrentUser() user: AccessTokenPayload,
    @Param('code') code: string,
  ) {
    const barcode = normalizeBarcode(code);
    if (!barcode) throw new BadRequestException('Штрихкод не распознан');
    const product = await this.wellness.productByBarcode(barcode);
    if (!product) throw new NotFoundException('Продукта пока нет в базе');
    const restrictions = await this.wellness.restrictions(user.sub);
    const result = await this.wellness.evaluate(
      product.ingredientsRaw,
      restrictions,
    );
    return { product, result };
  }

  /** Состав с упаковки от человека. Уходит в очередь модерации. */
  @Post('products')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createProduct(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.wellness.createProduct(
      user.sub,
      this.parse(() => parseProductInput(body)),
    );
  }

  @Post('products/:id/report')
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async report(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { comment?: unknown },
  ) {
    await this.wellness.report(
      user.sub,
      id,
      this.parse(() => parseReportComment(body.comment)),
    );
  }

  @Get('history')
  history(@CurrentUser() user: AccessTokenPayload) {
    return this.wellness.history(user.sub);
  }

  @Get('basket')
  basket(@CurrentUser() user: AccessTokenPayload) {
    return this.wellness.basket(user.sub);
  }

  @Post('basket/:productId')
  @HttpCode(204)
  async addToBasket(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    await this.wellness.addToBasket(user.sub, productId);
  }

  @Delete('basket/:productId')
  @HttpCode(204)
  async removeFromBasket(
    @CurrentUser() user: AccessTokenPayload,
    @Param('productId') productId: string,
  ) {
    await this.wellness.removeFromBasket(user.sub, productId);
  }

  /** Ошибка разбора — это 400 с человеческим текстом, а не 500. */
  private parse<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof WellnessInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
