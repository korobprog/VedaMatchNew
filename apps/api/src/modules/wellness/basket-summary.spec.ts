import { summarizeBasket } from './basket-summary';

describe('summarizeBasket', () => {
  it('считает по каждому исходу', () => {
    expect(summarizeBasket(['clean', 'clean', 'forbidden', 'unknown'])).toEqual(
      { total: 4, clean: 2, warning: 0, forbidden: 1, unknown: 1 },
    );
  });

  it('пустая корзина — нули, а не отсутствие полей', () => {
    expect(summarizeBasket([])).toEqual({
      total: 0,
      clean: 0,
      warning: 0,
      forbidden: 0,
      unknown: 0,
    });
  });
});
