import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { isAdmin } from './is-admin';

/**
 * Ставится после AuthGuard: тот уже положил в запрос актуальные роль и список
 * сервисов из базы. Сервисы модуля продолжают проверять роль сами — это второй
 * рубеж на случай, если маршрут заведут мимо контроллера.
 */
@Injectable()
export class MotivationAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AccessTokenPayload }>();
    if (!user || !isAdmin(user))
      throw new ForbiddenException('Только администратор');
    return true;
  }
}
