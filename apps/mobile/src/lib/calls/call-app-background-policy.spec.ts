import { decideBackgroundIncomingAction } from './call-app-background-policy';

describe('decideBackgroundIncomingAction', () => {
  it('Android — нативный путь (self-managed Connection/полноэкранный intent)', () => {
    expect(decideBackgroundIncomingAction('android')).toBe('native');
  });

  it('веб — ничего не делать: вкладка теряет фокус часто и это не повод сбросить звонок', () => {
    expect(decideBackgroundIncomingAction('web')).toBe('ignore');
  });

  it('прочая платформа — прежний decline (нет ни self-managed пути, ни браузерной вкладки)', () => {
    expect(decideBackgroundIncomingAction('ios')).toBe('decline');
    expect(decideBackgroundIncomingAction('windows')).toBe('decline');
  });
});
