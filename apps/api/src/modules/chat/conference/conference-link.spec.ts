import {
  CONFERENCE_MAX_PARTICIPANTS,
  CONFERENCE_TOKEN_BYTES,
  conferenceDenialText,
  conferenceJoinDecision,
  conferenceLinkExpiry,
  conferenceLinkState,
  conferenceLinkUrl,
  conferenceSeatsHint,
  conferenceTitle,
  createConferenceToken,
  normalizeConferenceToken,
  parseConferenceToken,
} from './conference-link';

const NOW = new Date('2026-09-22T12:00:00.000Z');
const hoursAfter = (hours: number) =>
  new Date(NOW.getTime() + hours * 60 * 60 * 1000);

describe('токен ссылки', () => {
  it('32 символа base64url из 24 байт', () => {
    const token = createConferenceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('берёт ровно CONFERENCE_TOKEN_BYTES байт у источника случайности', () => {
    const asked: number[] = [];
    createConferenceToken((size) => {
      asked.push(size);
      return Buffer.alloc(size, 7);
    });
    expect(asked).toEqual([CONFERENCE_TOKEN_BYTES]);
  });

  it('два вызова подряд дают разные токены', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createConferenceToken()),
    );
    expect(tokens.size).toBe(50);
  });

  // Угадываемость — это про энтропию, а не про длину строки: 24 байта дают
  // 192 бита, и тест сторожит именно источник, а не результат.
  it('не строится из предсказуемых данных', () => {
    const fromZeroes = createConferenceToken((size) => Buffer.alloc(size, 0));
    expect(fromZeroes).toBe('A'.repeat(32));
  });
});

describe('разбор токена', () => {
  const token = 'a'.repeat(32);

  it.each([
    ['голый токен', token, token],
    ['адрес сайта', `https://vedamatch.ru/j/${token}`, token],
    ['адрес с портом', `http://localhost:3000/j/${token}`, token],
    ['схема приложения', `vedamatch://j/${token}`, token],
    ['с хвостом запроса', `https://vedamatch.ru/j/${token}?utm=vk`, token],
    ['с якорем', `https://vedamatch.ru/j/${token}#room`, token],
    ['с пробелами вокруг', `  https://vedamatch.ru/j/${token}  `, token],
  ])('%s', (_name, input, expected) => {
    expect(parseConferenceToken(input)).toBe(expected);
  });

  it.each([
    ['чужой префикс пути', `https://vedamatch.ru/m/${token}`],
    ['без префикса', `https://vedamatch.ru/${token}`],
    ['короткий токен', `https://vedamatch.ru/j/${'a'.repeat(31)}`],
    ['длинный токен', `https://vedamatch.ru/j/${'a'.repeat(33)}`],
    ['посторонние символы', `https://vedamatch.ru/j/${'a'.repeat(30)}%%`],
    ['пустая строка', ''],
    ['не строка', 42],
    ['только префикс', 'https://vedamatch.ru/j/'],
  ])('%s — не токен', (_name, input) => {
    expect(parseConferenceToken(input as string)).toBeNull();
  });

  it('нормализация не «чинит» похожие символы', () => {
    // `l` и `I` в base64url — разные токены, а не опечатка друг друга.
    expect(normalizeConferenceToken('l'.repeat(32))).toBe('l'.repeat(32));
    expect(normalizeConferenceToken('I'.repeat(32))).toBe('I'.repeat(32));
    expect(normalizeConferenceToken(`${'a'.repeat(31)}+`)).toBeNull();
  });
});

describe('адрес ссылки', () => {
  const token = 'b'.repeat(32);

  it('собирается из origin и токена', () => {
    expect(conferenceLinkUrl('https://vedamatch.ru', token)).toBe(
      `https://vedamatch.ru/j/${token}`,
    );
  });

  it('хвостовой слэш в origin не даёт двойного', () => {
    expect(conferenceLinkUrl('https://vedamatch.ru///', token)).toBe(
      `https://vedamatch.ru/j/${token}`,
    );
  });

  it('собранный адрес разбирается обратно', () => {
    expect(parseConferenceToken(conferenceLinkUrl('https://x.ru', token))).toBe(
      token,
    );
  });
});

describe('срок жизни', () => {
  it('по умолчанию полсуток', () => {
    expect(conferenceLinkExpiry(NOW).toISOString()).toBe(
      hoursAfter(12).toISOString(),
    );
  });

  it('срок можно задать', () => {
    expect(conferenceLinkExpiry(NOW, 1).toISOString()).toBe(
      hoursAfter(1).toISOString(),
    );
  });

  it('активна до последней секунды и истекает ровно в срок', () => {
    const link = { expiresAt: hoursAfter(12), revokedAt: null };
    expect(conferenceLinkState(link, hoursAfter(11.99))).toBe('active');
    expect(conferenceLinkState(link, hoursAfter(12))).toBe('expired');
    expect(conferenceLinkState(link, hoursAfter(12.01))).toBe('expired');
  });

  it('отзыв сильнее срока', () => {
    const link = { expiresAt: hoursAfter(12), revokedAt: NOW };
    expect(conferenceLinkState(link, NOW)).toBe('revoked');
    // И у просроченной отзыв остаётся тем, что назовут человеку.
    expect(conferenceLinkState(link, hoursAfter(99))).toBe('revoked');
  });
});

describe('кого пускаем', () => {
  const room = (patch: Partial<Parameters<typeof conferenceJoinDecision>[0]>) =>
    conferenceJoinDecision({
      state: 'active',
      seatsTaken: 1,
      alreadyMember: false,
      ...patch,
    });

  it('новый человек входит', () => {
    expect(room({})).toEqual({ kind: 'enter' });
  });

  it('последнее место ещё отдаётся', () => {
    expect(room({ seatsTaken: CONFERENCE_MAX_PARTICIPANTS - 1 })).toEqual({
      kind: 'enter',
    });
  });

  it('пятого не пускаем', () => {
    expect(room({ seatsTaken: CONFERENCE_MAX_PARTICIPANTS })).toEqual({
      kind: 'deny',
      reason: 'full',
    });
  });

  it('свой возвращается в свою комнату', () => {
    expect(room({ alreadyMember: true })).toEqual({ kind: 'return' });
  });

  // Ключевое правило: отзыв и срок закрывают дверь чужим, а не выставляют
  // тех, кто уже внутри, — иначе «отозвать ссылку» ломало бы идущий разговор.
  it.each(['revoked', 'expired'] as const)(
    'свой возвращается даже когда ссылка %s',
    (state) => {
      expect(room({ state, alreadyMember: true })).toEqual({ kind: 'return' });
    },
  );

  it('свой возвращается даже в полную комнату — место уже его', () => {
    expect(
      room({
        seatsTaken: CONFERENCE_MAX_PARTICIPANTS,
        alreadyMember: true,
      }),
    ).toEqual({ kind: 'return' });
  });

  it('заблокированного хозяином не пускает даже действующая ссылка', () => {
    expect(room({ blockedWithHost: true })).toEqual({
      kind: 'deny',
      reason: 'blocked',
    });
  });

  it('блокировка важнее отзыва и полноты', () => {
    expect(
      room({
        blockedWithHost: true,
        state: 'revoked',
        seatsTaken: CONFERENCE_MAX_PARTICIPANTS,
      }),
    ).toEqual({ kind: 'deny', reason: 'blocked' });
  });

  it('блокировка не выставляет того, кто уже в комнате', () => {
    expect(room({ blockedWithHost: true, alreadyMember: true })).toEqual({
      kind: 'return',
    });
  });

  it('отозванная важнее полноты: причина должна быть честной', () => {
    expect(
      room({ state: 'revoked', seatsTaken: CONFERENCE_MAX_PARTICIPANTS }),
    ).toEqual({ kind: 'deny', reason: 'revoked' });
  });

  it.each(['revoked', 'expired'] as const)('чужого не пускаем: %s', (state) => {
    expect(room({ state })).toEqual({ kind: 'deny', reason: state });
  });

  it('потолок берётся из группового звонка, а не из своего числа', () => {
    expect(CONFERENCE_MAX_PARTICIPANTS).toBe(4);
  });

  it('потолок можно задать отдельно — для тестов и будущего SFU', () => {
    expect(room({ seatsTaken: 5 })).toEqual({ kind: 'deny', reason: 'full' });
    expect(
      conferenceJoinDecision(
        { state: 'active', seatsTaken: 5, alreadyMember: false },
        10,
      ),
    ).toEqual({ kind: 'enter' });
  });
});

describe('тексты человеку', () => {
  it('у каждой причины свой текст', () => {
    const texts = (['revoked', 'expired', 'full', 'blocked'] as const).map(
      (reason) => conferenceDenialText(reason),
    );
    expect(new Set(texts).size).toBe(4);
    texts.forEach((text) => expect(text.length).toBeGreaterThan(20));
  });

  // Отказ заблокированному не называет причину: «вас заблокировали» в ответ
  // на ссылку — это ответ на вопрос, который блокировавший не хотел
  // обсуждать.
  it('отказ заблокированному не выдаёт причину', () => {
    const text = conferenceDenialText('blocked');
    expect(text).not.toMatch(/блокир/i);
    expect(text).not.toMatch(/чёрн|черн/i);
  });

  it('про потолок говорится числом', () => {
    expect(conferenceDenialText('full')).toContain('4');
    expect(conferenceDenialText('full', 10)).toContain('10');
  });

  it('отказ не бросает человека без следующего шага', () => {
    expect(conferenceDenialText('expired')).toContain('Попросите новую');
    expect(conferenceDenialText('revoked')).toContain('Попросите новую');
    expect(conferenceDenialText('full')).toContain('подождите');
  });

  it.each([
    [0, 'Занято 0 из 4 — свободно ещё 4 места'],
    [1, 'Занято 1 из 4 — свободно ещё 3 места'],
    [3, 'Занято 3 из 4 — свободно ещё 1 место'],
    [4, 'Мест нет: заняты все 4'],
    [5, 'Мест нет: заняты все 4'],
  ])('подпись про места при %i занятых', (taken, expected) => {
    expect(conferenceSeatsHint(taken)).toBe(expected);
  });

  it('склонение мест не ломается на 5 и 11', () => {
    expect(conferenceSeatsHint(0, 5)).toContain('5 мест');
    expect(conferenceSeatsHint(0, 11)).toContain('11 мест');
    expect(conferenceSeatsHint(0, 21)).toContain('21 место');
  });
});

describe('название комнаты', () => {
  it('по умолчанию — имя хозяина', () => {
    expect(conferenceTitle('Мадхава')).toBe('Конференция · Мадхава');
  });

  it('своё название побеждает', () => {
    expect(conferenceTitle('Мадхава', '  Разбор Гиты  ')).toBe('Разбор Гиты');
  });

  it('пустое своё название не обнуляет подпись', () => {
    expect(conferenceTitle('Мадхава', '   ')).toBe('Конференция · Мадхава');
  });

  it('без имени хозяина остаётся понятная подпись', () => {
    expect(conferenceTitle('  ')).toBe('Быстрая конференция');
  });

  it('длинное название обрезается, а не ломает список бесед', () => {
    expect(conferenceTitle('Мадхава', 'я'.repeat(500))).toHaveLength(120);
  });
});
