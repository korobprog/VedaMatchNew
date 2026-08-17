import { buildIcs, escapeText, foldLine, formatUtc } from './build-ics';

const now = new Date('2026-08-17T12:00:00.000Z');

const event = {
  uid: 'n1@vedamatch',
  title: 'Воскресная программа',
  description: 'Киртан, лекция и прасад',
  location: 'Храм на Хорошёвке, Москва',
  url: 'https://vedamatch.local/notices/n1',
  startsAt: new Date('2026-09-06T14:00:00.000Z'),
  endsAt: new Date('2026-09-06T17:00:00.000Z'),
  createdAt: now,
};

describe('formatUtc', () => {
  it('пишет базовый формат RFC 5545', () => {
    expect(formatUtc(new Date('2026-09-06T14:00:00.000Z'))).toBe(
      '20260906T140000Z',
    );
  });
});

describe('escapeText', () => {
  it('экранирует спецсимволы формата', () => {
    expect(escapeText('а, б; в')).toBe('а\\, б\\; в');
    expect(escapeText('строка\nвторая')).toBe('строка\\nвторая');
  });

  it('слэш экранируется первым, а не поверх уже добавленного', () => {
    // Иначе `\,` превратилось бы в `\\,` и запятая перестала бы быть
    // экранированной.
    expect(escapeText('путь\\сюда')).toBe('путь\\\\сюда');
    expect(escapeText('a\\,b')).toBe('a\\\\\\,b');
  });
});

describe('foldLine', () => {
  it('короткую строку не трогает', () => {
    expect(foldLine('SUMMARY:Программа')).toEqual(['SUMMARY:Программа']);
  });

  it('считает октеты, а не символы', () => {
    // Кириллица в UTF-8 по два байта: 60 символов это 120 октетов.
    const line = `SUMMARY:${'я'.repeat(60)}`;
    const folded = foldLine(line);
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) {
      expect(Buffer.from(part, 'utf8').length).toBeLessThanOrEqual(75);
    }
  });

  it('не режет многобайтовый символ пополам', () => {
    const line = `DESCRIPTION:${'ё'.repeat(80)}`;
    const rebuilt = foldLine(line)
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join('');
    expect(rebuilt).toBe(line);
    // Символа замены быть не должно — значит границы прошли по символам.
    expect(foldLine(line).join('')).not.toContain('�');
  });

  it('продолжения начинаются с пробела', () => {
    const folded = foldLine(`SUMMARY:${'a'.repeat(200)}`);
    for (const part of folded.slice(1)) expect(part.startsWith(' ')).toBe(true);
  });
});

describe('buildIcs', () => {
  const ics = buildIcs([event], now);

  it('оборачивает событие в VCALENDAR и VEVENT', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('строки разделены CRLF, как требует формат', () => {
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n').some((l) => l.includes('\n'))).toBe(false);
  });

  it('несёт время начала и конца', () => {
    expect(ics).toContain('DTSTART:20260906T140000Z');
    expect(ics).toContain('DTEND:20260906T170000Z');
  });

  it('событию без конца ставит длительность по умолчанию', () => {
    const open = buildIcs([{ ...event, endsAt: null }], now);
    expect(open).toContain('DTSTART:20260906T140000Z');
    expect(open).toContain('DTEND:20260906T160000Z');
  });

  it('пустые поля не превращаются в пустые строки формата', () => {
    const bare = buildIcs(
      [{ ...event, description: null, location: null, url: null }],
      now,
    );
    expect(bare).not.toContain('DESCRIPTION:');
    expect(bare).not.toContain('LOCATION:');
    expect(bare).not.toContain('URL:');
  });

  it('несколько событий идут одним календарём', () => {
    const many = buildIcs([event, { ...event, uid: 'n2@vedamatch' }], now);
    expect(many.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(many.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
  });
});
