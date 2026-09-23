import { torchCopy, torchEnabled, zoomCopy } from './torch-state';

describe('torchEnabled', () => {
  it('горит, когда человек включил и экран на виду', () => {
    expect(torchEnabled({ wanted: true, focused: true })).toBe(true);
  });

  it('не горит, пока человек читает ответ', () => {
    // Светодиод жечь незачем, но выбор запоминается — см. следующий тест.
    expect(torchEnabled({ wanted: true, focused: false })).toBe(false);
  });

  it('возврат на сканер возвращает фонарик: выбор не забыт', () => {
    const wanted = true;
    expect(torchEnabled({ wanted, focused: false })).toBe(false);
    expect(torchEnabled({ wanted, focused: true })).toBe(true);
  });

  it('не включается сам', () => {
    expect(torchEnabled({ wanted: false, focused: true })).toBe(false);
    expect(torchEnabled({ wanted: false, focused: false })).toBe(false);
  });
});

describe('torchCopy', () => {
  it('подпись НЕ меняется вместе с состоянием', () => {
    // Главная причина «фонарик не работает»: подпись «Фонарик выкл.» шире
    // «Фонарик», кнопка расширялась, соседняя уезжала из-под пальца.
    expect(torchCopy(true).label).toBe(torchCopy(false).label);
  });

  it('состояние названо словами для скринридера', () => {
    expect(torchCopy(true).accessibilityLabel).toContain('включён');
    expect(torchCopy(false).accessibilityLabel).toContain('выключен');
  });

  it('скринридеру сказано и что будет по нажатию', () => {
    expect(torchCopy(true).accessibilityLabel).toContain('выключить');
    expect(torchCopy(false).accessibilityLabel).toContain('включить');
  });
});

describe('zoomCopy', () => {
  it('ширина подписи не меняется от шага к шагу', () => {
    const labels = [0, 1, 2].map((step) => zoomCopy(step, 3).label);
    expect(new Set(labels.map((label) => label.length)).size).toBe(1);
    expect(labels).toEqual(['Зум 1×', 'Зум 2×', 'Зум 3×']);
  });

  it('шаги считаются от единицы, как видит человек', () => {
    expect(zoomCopy(0, 3).accessibilityLabel).toContain('1 из 3');
    expect(zoomCopy(2, 3).accessibilityLabel).toContain('3 из 3');
  });

  it('подписи двух кнопок не совпадают', () => {
    expect(zoomCopy(0, 3).label).not.toBe(torchCopy(false).label);
  });
});
