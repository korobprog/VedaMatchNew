import type { BillingMode, RegistrationMode } from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';

/** Единственная строка настроек приложения. */
export const APP_SETTINGS_ID = 'global';

/**
 * Текущий режим биллинга без зависимости от BillingModule: его читают и
 * users, и support, и сам billing — все обязаны считать подписку одинаково,
 * иначе в режиме `beta` профиль показывает `expired`, а /billing/me — `active`.
 */
export async function readBillingMode(
  prisma: Pick<PrismaService, 'appSettings'>,
): Promise<BillingMode> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { billingMode: true },
  });
  return settings?.billingMode ?? 'business';
}

/**
 * Режим приёма новых аккаунтов. Читается в auth без зависимости от
 * BillingModule — по той же причине, что и режим биллинга: настройка одна
 * на приложение, а нужна она в другом модуле.
 */
export async function readRegistrationMode(
  prisma: Pick<PrismaService, 'appSettings'>,
): Promise<{ mode: RegistrationMode; note: string | null }> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { registrationMode: true, registrationNote: true },
  });
  return {
    mode: settings?.registrationMode ?? 'open',
    note: settings?.registrationNote ?? null,
  };
}
