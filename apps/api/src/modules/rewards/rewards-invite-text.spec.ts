import {
  INVITE_TEXT_DEFAULT,
  INVITE_TEXT_MAX_LENGTH,
  buildInviteMessage,
  linkifyTelegram,
  normalizeInviteText,
} from './rewards-invite-text';

const LINK = 'https://vedamatch.ru/?ref=abc123';

describe('buildInviteMessage', () => {
  it('в тексте по умолчанию ставит ссылку на место адреса в строке про регистрацию', () => {
    const text = buildInviteMessage(INVITE_TEXT_DEFAULT, LINK);

    expect(text).toContain(`как под IOS  так и под Android: ${LINK}`);
    // Заглавное название в шапке — не адрес, его не трогаем.
    expect(text.startsWith('🌎 VEDAMATCH.ru\n')).toBe(true);
    expect(text.endsWith('через: https://t.me/vedamatch_bot')).toBe(true);
    expect(text.split(LINK)).toHaveLength(2);
  });

  it('текст по умолчанию — дословно из карточки', () => {
    expect(INVITE_TEXT_DEFAULT).toContain('🌄 НАШИ СЕРВИСЫ:');
    expect(INVITE_TEXT_DEFAULT).toContain('⦁ Медиатека;');
    expect(INVITE_TEXT_DEFAULT).toContain('📤 ПРИСОЕДИНЯЙСЯ и делись!');
    expect(INVITE_TEXT_DEFAULT.endsWith('через: @vedamatch_bot')).toBe(true);
    expect(INVITE_TEXT_DEFAULT.length).toBeLessThanOrEqual(
      INVITE_TEXT_MAX_LENGTH,
    );
  });

  it('{ссылка} важнее адреса сайта', () => {
    expect(buildInviteMessage('Сайт vedamatch.ru, вход: {ссылка}', LINK)).toBe(
      `Сайт vedamatch.ru, вход: ${LINK}`,
    );
  });

  it('заменяет каждое {ссылка}', () => {
    expect(buildInviteMessage('{ссылка} и {ссылка}', LINK)).toBe(
      `${LINK} и ${LINK}`,
    );
  });

  it('не трогает адрес внутри другого адреса или с путём', () => {
    const template =
      'Полная: https://vedamatch.ru/music, почта info@vedamatch.ru, m.vedamatch.ru';
    expect(buildInviteMessage(template, LINK)).toBe(`${template}\n\n${LINK}`);
  });

  it('заменяет адрес в конце предложения', () => {
    expect(buildInviteMessage('Заходи на vedamatch.ru.', LINK)).toBe(
      `Заходи на ${LINK}.`,
    );
  });

  it('без адреса и без {ссылка} дописывает ссылку последней строкой', () => {
    expect(buildInviteMessage('Привет!', LINK)).toBe(`Привет!\n\n${LINK}`);
  });
});

describe('linkifyTelegram', () => {
  it('упоминание бота становится ссылкой https://t.me/', () => {
    expect(
      linkifyTelegram('установить APK можно и через наш:\n@vedamatch_bot'),
    ).toBe('установить APK можно и через наш:\nhttps://t.me/vedamatch_bot');
    expect(linkifyTelegram('Бот (@VedaMatchBot).')).toBe(
      'Бот (https://t.me/VedaMatchBot).',
    );
  });

  it('t.me без схемы получает https://', () => {
    expect(linkifyTelegram('Бот: t.me/vedamatch_bot')).toBe(
      'Бот: https://t.me/vedamatch_bot',
    );
  });

  it('не трогает готовые ссылки, почту и упоминания людей', () => {
    const text =
      'https://t.me/vedamatch_bot, http://t.me/x, info@vedamatch_bot.ru, @ivan, @robot_fan';
    expect(linkifyTelegram(text)).toBe(text);
  });

  it('бот в тексте администратора тоже становится ссылкой', () => {
    expect(
      buildInviteMessage('Сайт: {ссылка}\nБот: @vedamatch_bot', LINK),
    ).toBe(`Сайт: ${LINK}\nБот: https://t.me/vedamatch_bot`);
  });
});

describe('normalizeInviteText', () => {
  it('срезает края и приводит переводы строк', () => {
    expect(normalizeInviteText('  а\r\nб\rв  ')).toEqual({
      ok: true,
      text: 'а\nб\nв',
    });
  });

  it('пустое поле и null — вернуть текст по умолчанию', () => {
    expect(normalizeInviteText('   \n ')).toEqual({ ok: true, text: null });
    expect(normalizeInviteText(null)).toEqual({ ok: true, text: null });
  });

  it('отказывает длинному тексту и не-строке', () => {
    expect(normalizeInviteText('я'.repeat(INVITE_TEXT_MAX_LENGTH)).ok).toBe(
      true,
    );
    expect(normalizeInviteText('я'.repeat(INVITE_TEXT_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
    expect(normalizeInviteText(42).ok).toBe(false);
    expect(normalizeInviteText(undefined).ok).toBe(false);
  });
});
