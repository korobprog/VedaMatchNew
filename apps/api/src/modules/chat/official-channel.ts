import type { ChatMemberRole } from '@prisma/client';

/**
 * Правила членства в официальном канале VedaMatch.
 *
 * Уведомления по каналу выключены у всех, кроме администраторов: включаются
 * только явным согласием человека. Это требование App Store 4.5.4 к
 * рекламным и новостным пушам и антиспама Google Play. «Выключено» в чате —
 * это mutedUntil в далёком будущем, тот же приём, что у кнопки «без звука».
 *
 * Пишут в канал администраторы портала: у них роль admin, и общее правило
 * `denyWrite` пускает их без отдельного исключения.
 */

const MUTE_FOREVER_YEARS = 100;

export const OFFICIAL_CHANNEL_TITLE = 'VedaMatch';
export const OFFICIAL_CHANNEL_DESCRIPTION = 'Новости портала и его сервисов';

export function officialMembership(
  portalRole: string | null | undefined,
  now: Date,
): { role: ChatMemberRole; mutedUntil: Date | null } {
  if (portalRole === 'admin') return { role: 'admin', mutedUntil: null };
  const mutedUntil = new Date(now);
  mutedUntil.setFullYear(mutedUntil.getFullYear() + MUTE_FOREVER_YEARS);
  return { role: 'member', mutedUntil };
}
