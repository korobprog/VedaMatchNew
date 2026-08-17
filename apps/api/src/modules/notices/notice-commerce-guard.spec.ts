import { detectCommerce, needsReview } from './notice-commerce-guard';

const flagged = (title: string, description?: string) =>
  needsReview(detectCommerce(title, description ?? null));

describe('detectCommerce: ловит деньги в тексте', () => {
  it('цену в рублях в любой записи', () => {
    for (const text of [
      'Массаж 2000 ₽',
      'Занятие 1500 руб',
      'Консультация — 3 000 рублей',
      'Урок 800 р.',
    ]) {
      expect(flagged(text)).toBe(true);
    }
  });

  it('цену в валюте', () => {
    expect(flagged('Курс $30')).toBe(true);
    expect(flagged('Абонемент 50 EUR')).toBe(true);
    expect(flagged('Вебинар 900 грн')).toBe(true);
  });

  it('ставку за услугу', () => {
    expect(flagged('Репетитор, 1200 за час')).toBe(true);
  });

  it('слова продажи и МЛМ', () => {
    for (const text of [
      'Пришлю прайс',
      'Скидка для преданных',
      'Только по предоплате',
      'Отдаю оптом',
      'Стоимость уточняйте',
      'Доход от 100 тысяч',
      'Приглашаю в партнёрскую программу',
      'Это сетевой маркетинг, но хороший',
      'Инвестиции в проект',
    ]) {
      expect(flagged(text)).toBe(true);
    }
  });

  it('ищет и в описании, не только в заголовке', () => {
    expect(flagged('Массаж', 'Стоимость 2000 ₽ за сеанс')).toBe(true);
  });

  it('перечисляет, за что зацепились', () => {
    const signals = detectCommerce('Массаж 2000 ₽', 'Есть скидка');
    expect(signals.hits).toContain('цена в рублях');
    expect(signals.hits).toContain('скидка');
    expect(signals.score).toBe(2);
  });
});

describe('detectCommerce: не трогает нормальные объявления', () => {
  it('пропускает обычную доску', () => {
    for (const [title, description] of [
      ['Отдам холодильник', 'Работает, забрать самовывозом до 18:00'],
      ['Нужны руки на кухню', 'В субботу готовим прасад, нужны трое'],
      ['Еду в Маяпур 12 марта', 'Возьму попутчика, места есть'],
      ['Воскресная программа', 'Киртан в 17:00, потом прасад'],
      ['Потерял чётки', 'Красный мешочек, у входа в храм'],
      ['Ищу соседа-преданного', 'Двушка, тихий район, ищу второго жильца'],
    ] as const) {
      expect(flagged(title, description)).toBe(false);
    }
  });

  it('время и даты за цену не принимает', () => {
    // «до 18:00» и «12 марта» — не деньги.
    expect(flagged('Заберите до 18:00')).toBe(false);
    expect(flagged('Встречаемся 12 марта в 2000 году')).toBe(false);
  });

  it('пустой текст ничего не даёт', () => {
    expect(detectCommerce(null, null)).toEqual({ score: 0, hits: [] });
    expect(detectCommerce('   ', '')).toEqual({ score: 0, hits: [] });
  });
});
