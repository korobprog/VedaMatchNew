import type { NotificationPreferencesDto } from '@vedamatch/shared';
import { decideDelivery, describeDeliverySkip } from './delivery-rule';

/**
 * Разбор всех сочетаний выключателей «Сообщения» и «Звонки» (VED-361).
 *
 * Именно здесь проверяется обещание карточки: человек вправе заглушить
 * болтливую переписку и не пропустить звонок. Пока правило было строкой в
 * `deliver()`, проверить его можно было только через слушателя целиком — с
 * Prisma, FCM и Telegram в мок-обвесе.
 */

/** Полный набор тумблеров: все включены. */
function preferences(
  patch: Partial<NotificationPreferencesDto> = {},
): NotificationPreferencesDto {
  return {
    enabled: true,
    chat: true,
    calls: true,
    connections: true,
    support: true,
    transits: true,
    market: true,
    notices: true,
    motivation: true,
    music: true,
    work: true,
    travel: true,
    announcements: true,
    telegram: true,
    ...patch,
  };
}

describe('decideDelivery — звонки и сообщения независимы', () => {
  it('звонок идёт, когда «Сообщения» выключены', () => {
    expect(decideDelivery(preferences({ chat: false }), 'calls')).toEqual({
      deliver: true,
    });
  });

  it('сообщение идёт, когда «Звонки» выключены', () => {
    expect(decideDelivery(preferences({ calls: false }), 'chat')).toEqual({
      deliver: true,
    });
  });

  it('выключенные «Сообщения» гасят сообщение', () => {
    expect(decideDelivery(preferences({ chat: false }), 'chat')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
  });

  it('выключенные «Звонки» гасят звонок', () => {
    expect(decideDelivery(preferences({ calls: false }), 'calls')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
  });

  it('обе выключены — молчат обе, и каждая со своей причиной', () => {
    const both = preferences({ chat: false, calls: false });
    expect(decideDelivery(both, 'chat')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
    expect(decideDelivery(both, 'calls')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
  });

  it('общий выключатель гасит и звонок тоже', () => {
    // Осознанное «не беспокоить»: `enabled: false` сильнее любой категории,
    // иначе тумблер «Все уведомления» перестал бы что-либо значить.
    expect(decideDelivery(preferences({ enabled: false }), 'calls')).toEqual({
      deliver: false,
      reason: 'all-off',
    });
  });

  it('включённые «Звонки» при выключенном общем тумблере не спасают', () => {
    expect(
      decideDelivery(preferences({ enabled: false, calls: true }), 'calls')
        .deliver,
    ).toBe(false);
  });

  it('прочие категории по-прежнему решают сами за себя', () => {
    expect(decideDelivery(preferences({ market: false }), 'market')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
    expect(decideDelivery(preferences({ market: false }), 'work')).toEqual({
      deliver: true,
    });
  });

  it('категория без своего тумблера не проходит молча', () => {
    // Страховка от возврата старой беды: категория, которой забыли завести
    // поле, даёт `undefined` — и уведомления исчезают без следа в логе.
    const broken = preferences();
    delete (broken as Record<string, unknown>).calls;
    expect(decideDelivery(broken, 'calls')).toEqual({
      deliver: false,
      reason: 'category-off',
    });
  });
});

describe('describeDeliverySkip', () => {
  it('различает общий выключатель и категорию', () => {
    expect(describeDeliverySkip('all-off', 'calls')).toBe(
      'все уведомления выключены',
    );
    expect(describeDeliverySkip('category-off', 'calls')).toBe(
      'категория calls выключена',
    );
  });
});
