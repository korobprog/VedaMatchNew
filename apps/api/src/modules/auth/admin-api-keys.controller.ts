import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { ApiKeysService } from './api-keys.service';
import { AuthGuard, CurrentUser } from './auth.guard';

/**
 * Чужие ключи — глазами администрации.
 *
 * Живёт под `admin/`, и это не только про порядок в маршрутах: ни одно право,
 * выдаваемое ключу, не начинается с этого сегмента, поэтому сюда нельзя войти
 * ключом — ни своим, ни чужим. Только человек, вошедший в браузере.
 *
 * Выпуска здесь нет намеренно: ключ, выданный за человека, подписывал бы его
 * именем чужие действия. Администрация может только погасить.
 */
@Controller('admin/api-keys')
@UseGuards(AuthGuard)
export class AdminApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get('user/:userId')
  list(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('userId') userId: string,
  ) {
    return this.keys.listForAdmin(actor.role, userId);
  }

  @Delete(':id')
  async revoke(
    @CurrentUser() actor: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    await this.keys.revokeAsAdmin(actor.role, id);
    return { ok: true };
  }
}
