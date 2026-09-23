import type { DonationRecipientDto } from '@vedamatch/shared';

/**
 * Получатели пожертвований, чьи фото стоят на странице «Поддержать» у кнопок
 * «написать в личку» (VED-12). Порядок — как у заказчика: Станислав, затем
 * Маму Тхакур.
 *
 * Список закрытый и живёт в коде, а не приходит параметром запроса:
 * эндпоинт публичный, и по произвольному id он отдавал бы фото любого
 * человека портала. Те же id стоят на вебе в `DONATE_RECIPIENTS`
 * (`apps/web/src/lib/donate-content.ts`) — меняются получатели, меняются оба.
 */
export const DONATION_RECIPIENT_IDS: readonly string[] = [
  '33e14d6e-ebd9-46e9-99b9-fa206816895b',
  '6ef030ab-e528-49a3-b3d2-ce560d9e9683',
];

/**
 * Строки `User` → ответ в порядке списка. Кого нет в базе (dev-стенд,
 * удалённый аккаунт) — отдаём без фото, а не выкидываем: кнопку веб рисует
 * всё равно, и ей нужна хотя бы буква.
 */
export async function toDonationRecipients(
  ids: readonly string[],
  users: ReadonlyArray<{
    id: string;
    avatarKey: string | null;
    avatarUrl: string | null;
  }>,
  resolveAvatar: (user: {
    avatarKey: string | null;
    avatarUrl: string | null;
  }) => Promise<string | null>,
): Promise<DonationRecipientDto[]> {
  const byId = new Map(users.map((user) => [user.id, user]));
  return Promise.all(
    ids.map(async (userId) => {
      const user = byId.get(userId);
      return { userId, avatarUrl: user ? await resolveAvatar(user) : null };
    }),
  );
}
