import { columnDoneChange } from './work-column-done';

const now = new Date('2026-09-09T12:00:00.000Z');

describe('columnDoneChange', () => {
  it('без признака в запросе карточки не трогает', () => {
    expect(columnDoneChange(false, undefined, now)).toBeNull();
  });

  it('повторное включение ничего не меняет', () => {
    expect(columnDoneChange(true, true, now)).toBeNull();
  });

  it('включение закрывает карточки текущим временем', () => {
    expect(columnDoneChange(false, true, now)).toEqual({ completedAt: now });
  });

  it('выключение открывает карточки обратно', () => {
    expect(columnDoneChange(true, false, now)).toEqual({ completedAt: null });
  });
});
