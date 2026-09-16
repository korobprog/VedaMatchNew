import { reactToTokenChange } from './session-token-reaction';

describe('reactToTokenChange', () => {
  it('loading — ждать, токены есть или нет, не важно (feedback-002, п.1)', () => {
    expect(reactToTokenChange('loading', true)).toBe('ignore');
    expect(reactToTokenChange('loading', false)).toBe('ignore');
  });

  it('tokens → null при signed — guest (был вошедшим, сессия умерла в фоне)', () => {
    expect(reactToTokenChange('signed', false)).toBe('mark-guest');
  });

  it('tokens появились при guest — signed (кто-то другой в этом же процессе вошёл)', () => {
    expect(reactToTokenChange('guest', true)).toBe('mark-signed');
  });

  it('уже signed, токены есть — просто перепланировать таймер, статус не трогать', () => {
    expect(reactToTokenChange('signed', true)).toBe('reschedule');
  });

  it('уже guest, токенов всё ещё нет — ничего не делать (не дублировать выход)', () => {
    expect(reactToTokenChange('guest', false)).toBe('ignore');
  });
});
