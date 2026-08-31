import {
  assertReactionEmoji,
  assertSendable,
  ChatValidationError,
  normalizeAttachments,
  normalizeMessageBody,
} from './chat-validate';

/** Начало адресов бакета — такое же, как отдаёт ChatUploadsService. */
const OURS = 'https://cdn.vedamatch.ru/';
const CONVERSATION_ID = 'conversation-1';
const file = (name: string) => `${OURS}chat/${CONVERSATION_ID}/${name}`;

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
    expect(normalizeAttachments(undefined, OURS, CONVERSATION_ID)).toEqual([]);
  });

  it('требует ссылку у файловых вложений', () => {
    expect(() =>
      normalizeAttachments([{ kind: 'image' }], OURS, CONVERSATION_ID),
    ).toThrow(ChatValidationError);
  });

  it('требует заголовок у карточки сервиса', () => {
    expect(() =>
      normalizeAttachments(
        [{ kind: 'story', body: 'текст' }],
        OURS,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });

  it('нумерует вложения по порядку', () => {
    const list = normalizeAttachments(
      [
        { kind: 'image', url: file('a.webp') },
        { kind: 'image', url: file('b.webp') },
      ],
      OURS,
      CONVERSATION_ID,
    ) as unknown as Array<{ position: number }>;
    expect(list.map((x) => x.position)).toEqual([0, 1]);
  });

  it('зажимает уровни волны в 0..100 и округляет', () => {
    const [voice] = normalizeAttachments(
      [{ kind: 'voice', url: file('a.webm'), waveform: [-5, 42.4, 300] }],
      OURS,
      CONVERSATION_ID,
    );
    expect(voice.waveform).toEqual([0, 42, 100]);
  });

  it('выбрасывает отрицательные размеры вместо записи мусора', () => {
    const [attachment] = normalizeAttachments(
      [{ kind: 'file', url: file('a.pdf'), sizeBytes: -1, width: 0 }],
      OURS,
      CONVERSATION_ID,
    );
    expect(attachment.sizeBytes).toBeUndefined();
    expect(attachment.width).toBeUndefined();
  });

  it('не принимает чужой адрес: он рисуется у получателя как картинка', () => {
    expect(() =>
      normalizeAttachments(
        [{ kind: 'image', url: 'https://чужой/pixel.gif' }],
        OURS,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });

  it('чужой адрес превью карточки тоже не проходит', () => {
    expect(() =>
      normalizeAttachments(
        [
          {
            kind: 'story',
            title: 'Цитата',
            previewUrl: 'https://чужой/pixel.gif',
          },
        ],
        OURS,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });

  it('без настроенного хранилища ссылки не принимаются вовсе', () => {
    expect(() =>
      normalizeAttachments(
        [{ kind: 'image', url: file('a.webp') }],
        null,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });

  it('не принимает больше десяти вложений', () => {
    const many = Array.from({ length: 11 }, () => ({
      kind: 'image' as const,
      url: file('a.webp'),
    }));
    expect(() => normalizeAttachments(many, OURS, CONVERSATION_ID)).toThrow(
      ChatValidationError,
    );
  });

  it('не принимает файл другой беседы: тот же бакет, чужая папка', () => {
    expect(() =>
      normalizeAttachments(
        [{ kind: 'image', url: `${OURS}chat/other-conversation/a.webp` }],
        OURS,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });

  it('не принимает чужой аватар: тот же бакет, ключ вне chat/', () => {
    expect(() =>
      normalizeAttachments(
        [
          {
            kind: 'image',
            url: `${OURS}users/victim-id/avatar.webp`,
          },
        ],
        OURS,
        CONVERSATION_ID,
      ),
    ).toThrow(ChatValidationError);
  });
});

describe('assertSendable', () => {
  it('пропускает текст без вложений и вложение без текста', () => {
    expect(() => assertSendable('привет', [])).not.toThrow();
    expect(() =>
      assertSendable('', [{ kind: 'image', url: file('a.webp') }]),
    ).not.toThrow();
  });

  it('не пропускает пустое', () => {
    expect(() => assertSendable('', [])).toThrow(ChatValidationError);
  });
});
