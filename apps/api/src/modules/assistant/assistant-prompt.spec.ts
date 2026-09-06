import { buildComposePrompt, buildSystemPrompt } from './assistant-prompt';

const services = [
  { slug: 'market', name: 'Рынок', description: 'Товары', url: '/market' },
  { slug: 'chat', name: 'Общение', description: 'Чаты', url: '/chat' },
];

describe('buildSystemPrompt', () => {
  it('перечисляет сервисы каталога и запрещает выдумывать', () => {
    const prompt = buildSystemPrompt({
      services,
      user: { displayName: 'Радха', spiritualStage: 'devotee', city: 'Минск' },
      extra: '',
      actionsEnabled: true,
    });
    expect(prompt).toContain('- Рынок (/market): Товары');
    expect(prompt).toContain('Никогда не выдумывай');
    expect(prompt).toContain('Радха, преданный, город Минск');
    expect(prompt).toContain('motivation_create_reel');
  });

  it('без действий говорит, что публиковать не может', () => {
    const prompt = buildSystemPrompt({
      services,
      user: { displayName: 'Гость', spiritualStage: null, city: null },
      extra: '',
      actionsEnabled: false,
    });
    expect(prompt).not.toContain('motivation_create_reel');
    expect(prompt).toContain('не можешь');
    expect(prompt).toContain('этап не указан');
  });

  it('дополнение администрации идёт в конец, пустое — не упоминается', () => {
    const withExtra = buildSystemPrompt({
      services,
      user: { displayName: 'Радха', spiritualStage: null, city: null },
      extra: '  Не обсуждай политику.  ',
      actionsEnabled: true,
    });
    expect(withExtra.endsWith('Не обсуждай политику.')).toBe(true);
    const without = buildSystemPrompt({
      services,
      user: { displayName: 'Радха', spiritualStage: null, city: null },
      extra: '   ',
      actionsEnabled: true,
    });
    expect(without).not.toContain('Дополнительно от администрации');
  });
});

describe('buildComposePrompt', () => {
  it('просит вернуть только текст и знает собеседника', () => {
    const prompt = buildComposePrompt({
      recipientName: 'Кешава',
      context: ['Кешава: Привет!', 'Я: Привет, как дела?'],
      extra: '',
    });
    expect(prompt).toContain('ТОЛЬКО готовый текст');
    expect(prompt).toContain('зовут Кешава');
    expect(prompt).toContain('- Кешава: Привет!');
  });

  it('берёт не больше восьми последних реплик', () => {
    const context = Array.from({ length: 12 }, (_, i) => `реплика ${i}`);
    const prompt = buildComposePrompt({
      recipientName: null,
      context,
      extra: '',
    });
    expect(prompt).not.toContain('реплика 3');
    expect(prompt).toContain('реплика 4');
    expect(prompt).toContain('реплика 11');
  });
});
