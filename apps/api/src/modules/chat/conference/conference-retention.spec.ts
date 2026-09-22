import {
  DEFAULT_CONFERENCE_EMPTY_DAYS,
  conferenceDoorClosedAt,
  conferenceEmptyDays,
  conferenceGoneText,
  conferenceSweepCutoff,
  conferenceSweepVerdict,
} from './conference-retention';

/**
 * Срок хранения комнаты конференции.
 *
 * Цена ошибки несимметрична: лишняя пустая беседа — неудобство, удалённый
 * разговор — потеря. Поэтому таблица случаев начинается с «где говорили» и
 * проверяет его со всех сторон, включая заведомо просроченные и отозванные
 * двери.
 *
 * Даты строятся от `new Date()` арифметикой, а не литералами UTC: жёсткий
 * `Z` в ожиданиях падает в половине часовых поясов.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

describe('conferenceEmptyDays', () => {
  it('без настройки — неделя', () => {
    expect(conferenceEmptyDays(undefined)).toBe(DEFAULT_CONFERENCE_EMPTY_DAYS);
    expect(DEFAULT_CONFERENCE_EMPTY_DAYS).toBe(7);
  });

  it('берёт заданное число суток', () => {
    expect(conferenceEmptyDays('3')).toBe(3);
    expect(conferenceEmptyDays('365')).toBe(365);
    expect(conferenceEmptyDays('1')).toBe(1);
  });

  it('мусор, ноль и отрицательное не включают мгновенную чистку', () => {
    for (const raw of ['', 'неделя', '0', '-5', '1.5', 'NaN', '400'])
      expect(conferenceEmptyDays(raw)).toBe(DEFAULT_CONFERENCE_EMPTY_DAYS);
  });
});

describe('conferenceDoorClosedAt', () => {
  it('работающая ссылка — дверь не закрыта', () => {
    expect(
      conferenceDoorClosedAt({ expiresAt: days(1), revokedAt: null }, NOW),
    ).toBeNull();
  });

  it('истёкшая — закрылась в момент истечения', () => {
    const expiresAt = days(-2);
    expect(conferenceDoorClosedAt({ expiresAt, revokedAt: null }, NOW)).toEqual(
      expiresAt,
    );
  });

  it('отзыв раньше срока — считаем от отзыва', () => {
    const revokedAt = days(-5);
    expect(
      conferenceDoorClosedAt({ expiresAt: days(-2), revokedAt }, NOW),
    ).toEqual(revokedAt);
  });

  it('отзыв после истечения срока — считаем от срока', () => {
    const expiresAt = days(-5);
    expect(
      conferenceDoorClosedAt({ expiresAt, revokedAt: days(-1) }, NOW),
    ).toEqual(expiresAt);
  });

  it('срок, вышедший ровно сейчас, — уже закрытая дверь', () => {
    // Секунда «в срок» принадлежит закрытой двери, а не открытой: то же
    // правило, что и у `conferenceLinkState`, где `expiresAt <= now`
    // означает «истекла».
    expect(conferenceDoorClosedAt({ expiresAt: NOW, revokedAt: null }, NOW)).toEqual(
      NOW,
    );
  });

  it('отозванная, но ещё не истёкшая — закрыта отзывом', () => {
    const revokedAt = days(-1);
    expect(
      conferenceDoorClosedAt({ expiresAt: days(3), revokedAt }, NOW),
    ).toEqual(revokedAt);
  });
});

describe('conferenceSweepCutoff', () => {
  it('отступает ровно на заданное число суток назад', () => {
    expect(conferenceSweepCutoff(NOW, 7).getTime()).toBe(
      NOW.getTime() - 7 * DAY,
    );
  });
});

describe('conferenceSweepVerdict', () => {
  const empty = {
    state: 'expired' as const,
    messageCount: 0,
    expiresAt: days(-30),
    revokedAt: null,
  };

  it('пустая и давно закрытая — убирается', () => {
    expect(conferenceSweepVerdict(empty, NOW, 7)).toEqual({ kind: 'delete' });
  });

  it('пустая, но дверь ещё работает — остаётся', () => {
    expect(
      conferenceSweepVerdict(
        { ...empty, state: 'active', expiresAt: days(1) },
        NOW,
        7,
      ),
    ).toEqual({ kind: 'keep', reason: 'door_open' });
  });

  it('пустая, закрылась вчера — рано', () => {
    expect(
      conferenceSweepVerdict({ ...empty, expiresAt: days(-1) }, NOW, 7),
    ).toEqual({ kind: 'keep', reason: 'too_soon' });
  });

  it('ровно на границе срока — уже убирается', () => {
    expect(
      conferenceSweepVerdict({ ...empty, expiresAt: days(-7) }, NOW, 7),
    ).toEqual({ kind: 'delete' });
  });

  it('на волос раньше границы — ещё нет', () => {
    const expiresAt = new Date(NOW.getTime() - 7 * DAY + 1000);
    expect(conferenceSweepVerdict({ ...empty, expiresAt }, NOW, 7)).toEqual({
      kind: 'keep',
      reason: 'too_soon',
    });
  });

  it('где сказано хоть слово — не трогается, как бы давно ни закрылась', () => {
    expect(
      conferenceSweepVerdict(
        { ...empty, messageCount: 1, expiresAt: days(-3650) },
        NOW,
        1,
      ),
    ).toEqual({ kind: 'keep', reason: 'has_messages' });
  });

  it('отозванная с перепиской — тоже не трогается', () => {
    expect(
      conferenceSweepVerdict(
        {
          state: 'revoked',
          messageCount: 42,
          expiresAt: days(-100),
          revokedAt: days(-99),
        },
        NOW,
        1,
      ),
    ).toEqual({ kind: 'keep', reason: 'has_messages' });
  });

  it('отозванная и пустая — убирается по дате отзыва, а не по сроку ссылки', () => {
    // Вход закрыли сразу, а сама ссылка «жила бы» ещё полсуток вперёд.
    expect(
      conferenceSweepVerdict(
        {
          ...empty,
          state: 'revoked',
          expiresAt: days(-9),
          revokedAt: days(-9),
        },
        NOW,
        7,
      ),
    ).toEqual({ kind: 'delete' });
    // Отозвали только вчера — рано, даже если срок ссылки вышел давно.
    expect(
      conferenceSweepVerdict(
        {
          ...empty,
          state: 'revoked',
          expiresAt: days(-1),
          revokedAt: days(-1),
        },
        NOW,
        7,
      ),
    ).toEqual({ kind: 'keep', reason: 'too_soon' });
  });

  it('новая ссылка обнуляет отсчёт: дверь снова открыта', () => {
    // Хозяин нажал «выдать новую ссылку» — `expiresAt` уехал вперёд.
    expect(
      conferenceSweepVerdict(
        { ...empty, state: 'active', expiresAt: days(0.5), revokedAt: null },
        NOW,
        7,
      ),
    ).toEqual({ kind: 'keep', reason: 'door_open' });
  });

  it('срок по умолчанию — неделя', () => {
    expect(
      conferenceSweepVerdict({ ...empty, expiresAt: days(-6) }, NOW),
    ).toEqual({ kind: 'keep', reason: 'too_soon' });
    expect(
      conferenceSweepVerdict({ ...empty, expiresAt: days(-8) }, NOW),
    ).toEqual({ kind: 'delete' });
  });
});

describe('conferenceGoneText', () => {
  it('говорит, что делать, и не говорит «404»', () => {
    const text = conferenceGoneText();
    expect(text).toContain('Попросите новую ссылку');
    expect(text).not.toMatch(/404|токен|ссылка недействительна|ошибка/i);
    expect(text.endsWith('.')).toBe(true);
  });
});
