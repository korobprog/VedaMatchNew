import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { ALLOWED_API_KEY_SCOPES, normalizeScopes } from './api-key';
import { ApiKeysService } from './api-keys.service';
import { AuthGuard, CurrentUser } from './auth.guard';

const NAME_MAX = 60;

/**
 * Управление персональными ключами.
 *
 * Живёт под `auth/`, и это не косметика: ключ не имеет права `auth:*` — ни
 * одно из выдаваемых прав не начинается с этого сегмента, — поэтому ключом
 * нельзя выпустить второй ключ или продлить себе жизнь. Сюда пускает только
 * человек, вошедший в браузере.
 */
@Controller('auth/api-keys')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.keys.list(user.sub);
  }

  /** Права, которые сейчас можно попросить, — для формы выпуска. */
  @Get('scopes')
  scopes() {
    return { scopes: [...ALLOWED_API_KEY_SCOPES] };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Body()
    body: { name?: string; scopes?: unknown[]; expiresInDays?: number },
  ) {
    const name = (body.name ?? '').trim();
    if (!name) throw new BadRequestException('Назовите ключ');
    if (name.length > NAME_MAX)
      throw new BadRequestException(`Название длиннее ${NAME_MAX} знаков`);

    const scopes = normalizeScopes(body.scopes ?? []);
    // Молча выпущенный ключ без прав ходил бы в стену на каждом запросе, а
    // владелец видел бы «недействителен» и думал, что ключ испорчен.
    if (scopes.length === 0)
      throw new BadRequestException('Выберите хотя бы одно право');

    const expiresAt = resolveExpiry(body.expiresInDays);
    const issued = await this.keys.issue(user.sub, name, scopes, expiresAt);
    // Ключ уезжает целиком ровно один раз: дальше в базе только хеш, и
    // «покажите ещё раз» будет невыполнимо — об этом предупреждает интерфейс.
    return issued;
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.keys.revoke(user.sub, id);
    return { ok: true };
  }
}

/**
 * Срок жизни ключа. Пусто — бессрочный: у ключа для своей же машины срок
 * означает лишь то, что однажды он перестанет работать без объяснения.
 */
function resolveExpiry(days: number | undefined): Date | null {
  if (days === undefined || days === null) return null;
  if (!Number.isFinite(days) || days <= 0 || days > 3650)
    throw new BadRequestException('Срок задаётся в днях, от 1 до 3650');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
