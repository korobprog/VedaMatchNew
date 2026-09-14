import { welcomeMessage } from './welcome-message';

// VED-150: текст приветствия — дословно тот, что дала команда.
describe('welcomeMessage', () => {
  it('начинается с приветствия и заканчивается подписью команды', () => {
    const text = welcomeMessage();
    expect(text.startsWith('🌎 Добро пожаловать в VedaMatch!')).toBe(true);
    expect(text.endsWith('С теплом, команда VedaMatch.')).toBe(true);
  });

  it('абзацы разделены пустой строкой, как в присланном тексте', () => {
    const paragraphs = welcomeMessage().split('\n\n');
    expect(paragraphs).toHaveLength(8);
    expect(paragraphs[2]).toBe(
      'Важно: сайт пока в активной разработке. Многое уже работает, но ещё больше мы добавим и улучшим в ближайшее время, так что просьба не судить строго 😊\n' +
        'Если вдруг изредка немного виснет, значит обновляем. Так с любыми сайтами.',
    );
  });

  it('говорит о приложении на рабочем столе, поддержке и реферальной ссылке', () => {
    const text = welcomeMessage();
    expect(text).toContain(
      'добавить наш сервис на рабочий стол как приложение',
    );
    expect(text).toContain('пишите в поддержку, мы всегда на связи');
    expect(text).toContain('поделитесь реферальной ссылкой');
  });
});
