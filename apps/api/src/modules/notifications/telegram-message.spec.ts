import {
  buildTelegramMessageText,
  buildTelegramSendMessagePayload,
  buildTelegramWebAppUrl,
  classifyTelegramError,
  escapeTelegramHtml,
  mapNotificationUrlToWebAppPath,
  telegramRetryAfterMs,
} from './telegram-message';

describe('escapeTelegramHtml', () => {
  it('экранирует &, < и > в этом порядке', () => {
    expect(escapeTelegramHtml('Вринда & <Радха> > всё')).toBe(
      'Вринда &amp; &lt;Радха&gt; &gt; всё',
    );
  });

  it('не трогает обычный текст', () => {
    expect(escapeTelegramHtml('Харе Кришна')).toBe('Харе Кришна');
  });
});

describe('buildTelegramMessageText', () => {
  it('заголовок жирным, тело следующей строкой, оба экранированы', () => {
    expect(buildTelegramMessageText('Вринда <Деви>', 'Привет & пока')).toBe(
      '<b>Вринда &lt;Деви&gt;</b>\nПривет &amp; пока',
    );
  });

  it('пустое тело — одна строка без переноса', () => {
    expect(buildTelegramMessageText('Заголовок', '   ')).toBe(
      '<b>Заголовок</b>',
    );
  });
});

describe('mapNotificationUrlToWebAppPath', () => {
  it('переписка — ведёт по тому же пути', () => {
    expect(mapNotificationUrlToWebAppPath('/chat/abc123')).toBe('/chat/abc123');
    expect(mapNotificationUrlToWebAppPath('/chat/requests')).toBe(
      '/chat/requests',
    );
    expect(mapNotificationUrlToWebAppPath('/chat/abc123?call=xyz')).toBe(
      '/chat/abc123?call=xyz',
    );
  });

  it('страница портала вне мини-приложения — на корень', () => {
    expect(mapNotificationUrlToWebAppPath('/chat/with/abc')).toBe('/');
    expect(mapNotificationUrlToWebAppPath('/market/chats/abc')).toBe('/');
    expect(mapNotificationUrlToWebAppPath('/union/chats/abc')).toBe('/');
    expect(mapNotificationUrlToWebAppPath('/work/planner/space?task=X')).toBe(
      '/',
    );
  });
});

describe('buildTelegramWebAppUrl', () => {
  it('домонтирует путь к базовому адресу', () => {
    expect(
      buildTelegramWebAppUrl('https://ios.vedamatch.com', '/chat/abc?call=1'),
    ).toBe('https://ios.vedamatch.com/chat/abc?call=1');
  });

  it('корень остаётся корнем', () => {
    expect(buildTelegramWebAppUrl('https://ios.vedamatch.com', '/')).toBe(
      'https://ios.vedamatch.com/',
    );
  });
});

describe('buildTelegramSendMessagePayload', () => {
  it('собирает тело запроса с кнопкой «Открыть» в мини-приложение', () => {
    const payload = buildTelegramSendMessagePayload({
      chatId: '42',
      title: 'Вринда',
      body: 'Харе Кришна!',
      notificationUrl: '/chat/abc?call=1',
      webAppBaseUrl: 'https://ios.vedamatch.com',
    });
    expect(payload).toEqual({
      chat_id: '42',
      text: '<b>Вринда</b>\nХаре Кришна!',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Открыть',
              web_app: { url: 'https://ios.vedamatch.com/chat/abc?call=1' },
            },
          ],
        ],
      },
    });
  });

  it('незнакомый путь уведомления — кнопка ведёт на корень', () => {
    const payload = buildTelegramSendMessagePayload({
      chatId: '42',
      title: 'Заявка №1',
      body: 'Новый заказ',
      notificationUrl: '/market/orders/1',
      webAppBaseUrl: 'https://ios.vedamatch.com',
    });
    expect(
      (
        payload.reply_markup as {
          inline_keyboard: [[{ web_app: { url: string } }]];
        }
      ).inline_keyboard[0][0].web_app.url,
    ).toBe('https://ios.vedamatch.com/');
  });
});

describe('classifyTelegramError', () => {
  it('403 — устройство протухло', () => {
    expect(classifyTelegramError(403, null)).toBe('gone');
  });

  it('400 «chat not found» — тоже gone, а прочий 400 — permanent', () => {
    expect(
      classifyTelegramError(400, {
        description: 'Bad Request: chat not found',
      }),
    ).toBe('gone');
    expect(
      classifyTelegramError(400, {
        description: 'Bad Request: message is too long',
      }),
    ).toBe('permanent');
    expect(classifyTelegramError(400, null)).toBe('permanent');
  });

  it('429 — rate-limited, 5xx — transient, остальное — permanent', () => {
    expect(classifyTelegramError(429, {})).toBe('rate-limited');
    expect(classifyTelegramError(500, {})).toBe('transient');
    expect(classifyTelegramError(503, {})).toBe('transient');
    expect(classifyTelegramError(404, {})).toBe('permanent');
    expect(classifyTelegramError(401, {})).toBe('permanent');
  });
});

describe('telegramRetryAfterMs', () => {
  it('читает retry_after и переводит в миллисекунды', () => {
    expect(telegramRetryAfterMs({ parameters: { retry_after: 2 } })).toBe(2000);
  });

  it('ограничивает значение потолком в 5 секунд', () => {
    expect(telegramRetryAfterMs({ parameters: { retry_after: 30 } })).toBe(
      5000,
    );
  });

  it('без числа или без parameters — 0', () => {
    expect(telegramRetryAfterMs(null)).toBe(0);
    expect(telegramRetryAfterMs({})).toBe(0);
    expect(telegramRetryAfterMs({ parameters: {} })).toBe(0);
    expect(telegramRetryAfterMs({ parameters: { retry_after: 'скоро' } })).toBe(
      0,
    );
    expect(telegramRetryAfterMs({ parameters: { retry_after: -1 } })).toBe(0);
  });
});
