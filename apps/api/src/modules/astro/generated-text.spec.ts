import { extractGeneratedText } from './generated-text';

describe('extractGeneratedText', () => {
  it('достаёт текст из JSON, как просит промпт', () => {
    expect(extractGeneratedText('{"text": " Разбор карты "}')).toBe(
      'Разбор карты',
    );
  });

  // Так на проде выглядела карточка «Персональный день» на главной.
  it('снимает обёртку блока кода вокруг JSON', () => {
    expect(
      extractGeneratedText(
        '```json\n{"text": "Сегодня день приглашает обратить внимание на себя"}\n```',
      ),
    ).toBe('Сегодня день приглашает обратить внимание на себя');
  });

  it('снимает обёртку и без названия языка, и без переносов', () => {
    expect(extractGeneratedText('```{"text":"Тон дня"}```')).toBe('Тон дня');
  });

  it('принимает простой текст, когда модель проигнорировала JSON-режим', () => {
    expect(extractGeneratedText('  Просто текст без обёртки ')).toBe(
      'Просто текст без обёртки',
    );
  });

  it('оборванный JSON не выдаёт за текст', () => {
    expect(
      extractGeneratedText('```json\n{"text": "Сегодня день приглашает'),
    ).toBeNull();
    expect(extractGeneratedText('{"text": "Сегодня')).toBeNull();
  });

  it('JSON без текста не выдаёт за текст', () => {
    expect(extractGeneratedText('{"answer": "не тот ключ"}')).toBeNull();
    expect(extractGeneratedText('{"text": "   "}')).toBeNull();
  });

  it('пустой ответ — не текст', () => {
    expect(extractGeneratedText('   ')).toBeNull();
    expect(extractGeneratedText('```json\n```')).toBeNull();
  });
});
