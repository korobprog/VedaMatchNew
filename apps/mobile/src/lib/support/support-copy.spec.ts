import type { SupportTicketListItem } from '@vedamatch/shared';
import {
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_ORDER,
  acceptsReplies,
  describeTicketRow,
  formatTicketTime,
  messageAuthor,
} from './support-copy';

const NOW = new Date(2026, 8, 23, 12, 0);

function item(over: Partial<SupportTicketListItem> = {}): SupportTicketListItem {
  return {
    id: 't1',
    number: 42,
    subject: 'Не приходят пуши',
    category: 'technical',
    status: 'open',
    createdAt: new Date(2026, 8, 21, 14, 5).toISOString(),
    lastMessageAt: new Date(2026, 8, 21, 14, 5).toISOString(),
    firstResponseAt: null,
    messageCount: 1,
    ...over,
  };
}

describe('formatTicketTime', () => {
  it('в этом году — без года', () => {
    expect(formatTicketTime(new Date(2026, 8, 21, 14, 5).toISOString(), NOW)).toBe('21.09, 14:05');
  });

  it('в прошлом году — с годом', () => {
    expect(formatTicketTime(new Date(2025, 0, 3, 9, 7).toISOString(), NOW)).toBe('03.01.2025, 09:07');
  });

  it('битая дата — пусто, а не «NaN.NaN»', () => {
    expect(formatTicketTime('вчера', NOW)).toBe('');
  });
});

describe('describeTicketRow', () => {
  it('новое обращение: номер с темой, статус и «ждёт первого ответа»', () => {
    const row = describeTicketRow(item(), NOW);
    expect(row.title).toBe('№42 · Не приходят пуши');
    expect(row.status).toBe('Новое');
    expect(row.details).toBe('Техническая проблема · 21.09, 14:05 · ждёт первого ответа');
    expect(row.awaitsUser).toBe(false);
  });

  it('ответ поддержки, ждут человека — отмечено и словом для скринридера', () => {
    const row = describeTicketRow(
      item({ status: 'waiting_user', firstResponseAt: new Date(2026, 8, 22).toISOString() }),
      NOW,
    );
    expect(row.status).toBe('Ждём ответа');
    expect(row.awaitsUser).toBe(true);
    expect(row.details).toContain('поддержка ответила');
    expect(row.accessibilityLabel).toContain('Поддержка ждёт вашего ответа');
  });
});

describe('переписка', () => {
  it('ответ поддержки подписан поддержкой, своё — «Вы»', () => {
    expect(messageAuthor({ authorType: 'admin', authorName: null })).toBe('Поддержка VedaMatch');
    expect(messageAuthor({ authorType: 'admin', authorName: 'Поддержка VedaMatch' })).toBe('Поддержка VedaMatch');
    expect(messageAuthor({ authorType: 'user', authorName: null })).toBe('Вы');
  });

  it('писать нельзя только в закрытое', () => {
    expect(acceptsReplies('closed')).toBe(false);
    expect(acceptsReplies('resolved')).toBe(true);
    expect(acceptsReplies('waiting_user')).toBe(true);
  });

  it('у каждой категории формы есть подпись', () => {
    expect(TICKET_CATEGORY_ORDER).toHaveLength(Object.keys(TICKET_CATEGORY_LABELS).length);
    for (const category of TICKET_CATEGORY_ORDER) expect(TICKET_CATEGORY_LABELS[category]).toBeTruthy();
  });
});
