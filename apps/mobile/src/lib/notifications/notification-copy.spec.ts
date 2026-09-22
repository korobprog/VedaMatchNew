import {
  cardAccessibilityHint,
  cardAccessibilityLabel,
  categoryLabel,
  markAccessibilityLabel,
  markView,
} from './notification-copy';
import { dark, light } from '@/theme/tokens';

describe('categoryLabel', () => {
  it('называет раздел так, как он называется в портале', () => {
    expect(categoryLabel('chat')).toBe('Общение');
    expect(categoryLabel('market')).toBe('Рынок');
    // На проде сервис называется «Медиатека», а не «Музыка» из старого сида.
    expect(categoryLabel('music')).toBe('Медиатека');
    expect(categoryLabel('announcements')).toBe('От администрации');
  });

  it('незнакомый код не падает и не выдумывает подпись', () => {
    expect(categoryLabel('чего-то новенького')).toBeNull();
  });
});

describe('markView', () => {
  it('слово — название колонки доски, включая «Тестерование» через «е»', () => {
    expect(markView('in_progress')?.label).toBe('В работе');
    expect(markView('testing')?.label).toBe('Тестерование');
    expect(markView('done')?.label).toBe('Выполнено');
    expect(markView('rework')?.label).toBe('На доработку');
  });

  it('состояния нет — значка нет', () => {
    expect(markView(null)).toBeNull();
    expect(markView(undefined)).toBeNull();
  });

  it('цвет рамки — имя токена, определённого в обеих темах', () => {
    for (const mark of ['in_progress', 'testing', 'done', 'rework'] as const) {
      const border = markView(mark)!.border;
      expect(typeof light[border]).toBe('string');
      expect(typeof dark[border]).toBe('string');
      // Хардкод `#RRGGBB` наружу не уходит: модуль отдаёт имя, а не цвет.
      expect(border).not.toMatch(/^#/);
    }
  });

  it('состояния различаются не только словом, но и рамкой', () => {
    const borders = (['in_progress', 'testing', 'done', 'rework'] as const).map(
      (mark) => markView(mark)!.border,
    );
    expect(new Set(borders).size).toBe(4);
  });
});

describe('markAccessibilityLabel', () => {
  it('говорит, чьё это слово', () => {
    expect(markAccessibilityLabel({ label: 'Выполнено', border: 'cyan' })).toBe(
      'Статус: Выполнено',
    );
  });
});

describe('cardAccessibilityLabel', () => {
  const base = {
    title: 'Новая заявка',
    body: 'Пётр отозвался на объявление',
    when: '12 мин назад',
    category: 'notices',
    unread: false,
    mark: null,
  };

  it('собирает карточку одной строкой в порядке чтения', () => {
    expect(cardAccessibilityLabel(base)).toBe(
      'Объявления. Новая заявка. Пётр отозвался на объявление. 12 мин назад',
    );
  });

  it('непрочитанное проговаривается словом: точку скринридер не видит', () => {
    expect(cardAccessibilityLabel({ ...base, unread: true })).toMatch(/^Не прочитано\./);
    expect(cardAccessibilityLabel(base)).not.toMatch(/Не прочитано/);
  });

  it('состояние задачи попадает в подпись', () => {
    expect(cardAccessibilityLabel({ ...base, mark: 'done' })).toContain('Статус: Выполнено');
  });

  it('пустой текст и незнакомая категория не дают пустых кусков', () => {
    expect(cardAccessibilityLabel({ ...base, body: '', category: 'чужое', when: '' })).toBe(
      'Новая заявка',
    );
  });
});

describe('cardAccessibilityHint', () => {
  it('предупреждает про уход в браузер заранее', () => {
    expect(cardAccessibilityHint(true)).toContain('сайт');
    expect(cardAccessibilityHint(false)).not.toContain('сайт');
  });
});
