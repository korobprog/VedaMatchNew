import { welcomeMessage } from './welcome-message';

describe('welcomeMessage', () => {
  it('обращается по имени', () => {
    expect(welcomeMessage('Мадхава')).toContain(
      'Мадхава, добро пожаловать в VedaMatch!',
    );
  });

  it('имя с пробелами по краям не ломает обращение', () => {
    expect(welcomeMessage('  Радха  ')).toContain('Радха, добро пожаловать');
  });

  // «Здравствуйте, !» хуже, чем просто приветствие.
  it('без имени обходится без обращения', () => {
    const text = welcomeMessage('   ');
    expect(text.startsWith('Добро пожаловать в VedaMatch!')).toBe(true);
    expect(text).not.toContain(', добро пожаловать');
  });

  it('говорит, куда идти дальше и что можно ответить', () => {
    const text = welcomeMessage('Говинда');
    expect(text).toContain('короткой настройки');
    expect(text).toContain('ответьте на это сообщение');
  });
});
