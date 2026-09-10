import { inviteScope } from './invite-scope';

describe('inviteScope', () => {
  it('обычный участник видит только знакомых, что бы он ни искал', () => {
    // «Работа» не место, где ищут незнакомых.
    expect(inviteScope(false, undefined)).toBe('known');
    expect(inviteScope(false, 'Артём')).toBe('known');
  });

  it('администратор по осмысленному запросу ищет по всему порталу', () => {
    expect(inviteScope(true, 'Артём')).toBe('portal');
    expect(inviteScope(true, 'ар')).toBe('portal');
  });

  it('администратору без запроса портал не открывается', () => {
    // Иначе панель открывается перечислением участников, а не поиском.
    expect(inviteScope(true, undefined)).toBe('known');
    expect(inviteScope(true, '')).toBe('known');
    expect(inviteScope(true, '   ')).toBe('known');
  });

  it('одна буква — ещё не поиск', () => {
    expect(inviteScope(true, 'а')).toBe('known');
    expect(inviteScope(true, ' а ')).toBe('known');
  });
});
