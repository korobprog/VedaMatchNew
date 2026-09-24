import { CHAT_MESSAGE_MAX_LENGTH } from '@vedamatch/shared';
import {
  appReleasePostFields,
  humanVersion,
  OFFICIAL_POST_SOURCE,
  officialPostLink,
  officialPostText,
} from './official-post-text';

const news = {
  source: OFFICIAL_POST_SOURCE.announcement,
  title: 'Открыли «Путешествия»',
  body: 'Теперь можно искать ночлег у преданных.',
  path: '/updates/news',
};

describe('officialPostLink', () => {
  it('домен портала плюс путь, без двойного слэша', () => {
    expect(officialPostLink('https://vedamatch.ru/', '/app')).toBe(
      'https://vedamatch.ru/app',
    );
    expect(officialPostLink('https://vedamatch.ru', 'updates/news')).toBe(
      'https://vedamatch.ru/updates/news',
    );
  });

  it('без домена — голый путь, а не выдуманный адрес', () => {
    expect(officialPostLink(null, '/app')).toBe('/app');
  });
});

describe('humanVersion', () => {
  it('sha сборки прячет, номер сборки показывает', () => {
    expect(humanVersion('1.4.0+abc1234', 1031)).toBe('1.4.0 (сборка 1031)');
  });

  it('без номера пакета — только сборка', () => {
    expect(humanVersion('+abc', 7)).toBe('сборка 7');
  });
});

describe('officialPostText', () => {
  it('новость: заголовок, текст и ссылка «подробнее» полным адресом', () => {
    expect(officialPostText(news, 'https://vedamatch.ru')).toBe(
      [
        '📰 Открыли «Путешествия»',
        '',
        'Теперь можно искать ночлег у преданных.',
        '',
        'Подробнее: https://vedamatch.ru/updates/news',
      ].join('\n'),
    );
  });

  it('длинная новость укладывается в лимит сообщения, ссылка остаётся', () => {
    const text = officialPostText(
      { ...news, body: 'а'.repeat(5000) },
      'https://vedamatch.ru',
    );
    expect(text.length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);
    expect(text.endsWith('Подробнее: https://vedamatch.ru/updates/news')).toBe(
      true,
    );
    expect(text).toContain('а…');
  });

  it('текст ровно по лимиту не режется', () => {
    const frame = officialPostText({ ...news, body: '' }, 'https://x.ru');
    const room = CHAT_MESSAGE_MAX_LENGTH - frame.length - 4;
    const text = officialPostText(
      { ...news, body: 'б'.repeat(room) },
      'https://x.ru',
    );
    expect(text).not.toContain('…');
    expect(text.length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);
  });

  it('пустое тело — без пустого абзаца посередине', () => {
    expect(officialPostText({ ...news, body: '  ' }, null)).toBe(
      '📰 Открыли «Путешествия»\n\nПодробнее: /updates/news',
    );
  });

  it('выпуск приложения: ссылка на загрузку и где обновиться в приложении', () => {
    const fields = appReleasePostFields({
      versionName: '1.4.0+abc1234',
      versionCode: 1031,
      notes: 'Голосовые сообщения\nТёмная тема',
    });
    const text = officialPostText(
      { source: OFFICIAL_POST_SOURCE.appRelease, path: '/app', ...fields },
      'https://vedamatch.ru',
    );
    expect(text).toBe(
      [
        '📲 Вышла версия 1.4.0 (сборка 1031) приложения VedaMatch для Android',
        '',
        'Что нового:',
        'Голосовые сообщения',
        'Тёмная тема',
        '',
        'Скачать или обновить: https://vedamatch.ru/app',
        'В приложении с сайта: «Сервисы» → «Проверить обновление».',
      ].join('\n'),
    );
  });

  it('выпуск без заметки — общая строка, а не пустое «Что нового»', () => {
    expect(
      appReleasePostFields({ versionName: '1.4.0', versionCode: 5, notes: '  ' })
        .body,
    ).toBe('Исправления и улучшения.');
  });
});
