import {
  assertReactionEmoji,
  assertSendable,
  ChatValidationError,
  normalizeAttachments,
  normalizeMessageBody,
} from './chat-validate';

describe('normalizeMessageBody', () => {
  it('обрезает пробелы по краям', () => {
    expect(normalizeMessageBody('  привет \n')).toBe('привет');
  });

  it('пустое превращает в пустую строку, а не в undefined', () => {
    expect(normalizeMessageBody(undefined)).toBe('');
  });

  it('не принимает слишком длинное', () => {
    expect(() => normalizeMessageBody('я'.repeat(2001))).toThrow(
      ChatValidationError,
    );
  });
});

describe('assertReactionEmoji', () => {
  it('пропускает эмодзи из белого списка', () => {
    expect(() => assertReactionEmoji('🙏')).not.toThrow();
  });

  it('не пропускает произвольную строку', () => {
    expect(() => assertReactionEmoji('💩')).toThrow(ChatValidationError);
  });
});

describe('normalizeAttachments', () => {
  it('без вложений возвращает пустой список', () => {
    expect(normalizeAttachments(undefined)).toEqual([]);
  });

  it('требует ссылку у файловых вложений', () => {
    expect(() => normalizeAttachments([{ kind: 'image' }])).toThrow(
      ChatValidationError,
    );
  });

  it('требует заголовок у карточки сервиса', () => {
    expect(() =>
      normalizeAttachments([{ kind: 'story', body: 'текст' }]),
    ).toThrow(ChatValidationError);
  });

  it('нумерует вложения по порядку', () => {
    const list = normalizeAttachments([
      { kind: 'image', url: 'a' },
      { kind: 'image', url: 'b' },
    ]) as unknown as Array<{ position: number }>;
    expect(list.map((x) => x.position)).toEqual([0, 1]);
  });

  it('зажимает уровни волны в 0..100 и округляет', () => {
    const [voice] = normalizeAttachments([
      { kind: 'voice', url: 'a', waveform: [-5, 42.4, 300] },
    ]);
    expect(voice.waveform).toEqual([0, 42, 100]);
  });

  it('выбрасывает отрицательные размеры вместо записи мусора', () => {
    const [file] = normalizeAttachments([
      { kind: 'file', url: 'a', sizeBytes: -1, width: 0 },
    ]);
    expect(file.sizeBytes).toBeUndefined();
    expect(file.width).toBeUndefined();
  });

  it('не принимает больше десяти вложений', () => {
    const many = Array.from({ length: 11 }, () => ({
      kind: 'image' as const,
      url: 'a',
    }));
    expect(() => normalizeAttachments(many)).toThrow(ChatValidationError);
  });
});

describe('assertSendable', () => {
  it('пропускает текст без вложений и вложение без текста', () => {
    expect(() => assertSendable('привет', [])).not.toThrow();
    expect(() =>
      assertSendable('', [{ kind: 'image', url: 'a' }]),
    ).not.toThrow();
  });

  it('не пропускает пустое', () => {
    expect(() => assertSendable('', [])).toThrow(ChatValidationError);
  });
});
