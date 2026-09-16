import type { ChatAttachmentInput, ChatMessageDto, ChatUploadResult } from '@vedamatch/shared';
import { CHAT_MAX_ATTACHMENTS } from '@vedamatch/shared';
import {
  addAttachment,
  buildEditRequest,
  buildSendRequest,
  canAddAttachment,
  canSubmitComposer,
  enterEditMode,
  exitEditMode,
  removeAttachmentAt,
  restoreReplyAfterEdit,
  toAttachmentInput,
} from './chat-composer-state';

function attachment(id: string): ChatAttachmentInput {
  return { kind: 'image', url: `https://x/${id}`, key: id, mimeType: 'image/jpeg', sizeBytes: 10 };
}

describe('addAttachment/canAddAttachment', () => {
  it('добавляет вложение, пока не достигнут лимит', () => {
    const list = addAttachment([attachment('1')], attachment('2'));
    expect(list).toHaveLength(2);
  });

  it('не добавляет сверх CHAT_MAX_ATTACHMENTS', () => {
    const full = Array.from({ length: CHAT_MAX_ATTACHMENTS }, (_, i) => attachment(String(i)));
    expect(canAddAttachment(full.length)).toBe(false);
    expect(addAttachment(full, attachment('overflow'))).toHaveLength(CHAT_MAX_ATTACHMENTS);
  });
});

describe('removeAttachmentAt', () => {
  it('убирает по индексу, остальные сохраняет по порядку', () => {
    const list = [attachment('1'), attachment('2'), attachment('3')];
    expect(removeAttachmentAt(list, 1).map((a) => a.key)).toEqual(['1', '3']);
  });
});

describe('toAttachmentInput', () => {
  const upload: ChatUploadResult = { kind: 'file', url: 'https://x/f', key: 'f', mimeType: 'application/pdf', sizeBytes: 100 };

  it('файлу присваивает title по имени, фото — нет', () => {
    expect(toAttachmentInput(upload, 'report.pdf').title).toBe('report.pdf');
    expect(toAttachmentInput({ ...upload, kind: 'image' }, 'report.pdf').title).toBeUndefined();
  });
});

describe('enterEditMode/exitEditMode', () => {
  const message: ChatMessageDto = {
    id: 'm1',
    conversationId: 'c1',
    author: { id: 'u1', name: 'Автор' },
    body: 'Текст сообщения',
    attachments: [],
    reactions: [],
    createdAt: new Date().toISOString(),
  };

  it('при первом входе откладывает текущий черновик поля', () => {
    const result = enterEditMode({ currentEditingId: null, nextMessage: message, currentDraft: 'Начатое письмо', savedDraft: null });
    expect(result).toEqual({ draft: 'Текст сообщения', draftBeforeEdit: 'Начатое письмо' });
  });

  it('при переключении на другое сообщение отложенный черновик не трогает', () => {
    const result = enterEditMode({
      currentEditingId: 'm0',
      nextMessage: message,
      currentDraft: 'Текст сообщения m0',
      savedDraft: 'Начатое письмо',
    });
    expect(result).toEqual({ draft: 'Текст сообщения', draftBeforeEdit: 'Начатое письмо' });
  });

  it('отмена правки возвращает отложенный черновик', () => {
    expect(exitEditMode('Начатое письмо')).toEqual({ draft: 'Начатое письмо', draftBeforeEdit: null });
  });

  it('отмена правки без черновика — пустое поле', () => {
    expect(exitEditMode(null)).toEqual({ draft: '', draftBeforeEdit: null });
  });
});

describe('restoreReplyAfterEdit', () => {
  const reply: ChatMessageDto = {
    id: 'r1',
    conversationId: 'c1',
    author: { id: 'u2', name: 'Собеседник' },
    body: 'Отложенный ответ',
    attachments: [],
    reactions: [],
    createdAt: new Date().toISOString(),
  };

  it('возвращает отложенный ответ и сбрасывает отложенное состояние', () => {
    expect(restoreReplyAfterEdit(reply)).toEqual({ replyTo: reply, replyBeforeEdit: null });
  });

  it('если ответа не было — остаётся null, а не теряется молча по-другому', () => {
    expect(restoreReplyAfterEdit(null)).toEqual({ replyTo: null, replyBeforeEdit: null });
  });
});

describe('buildSendRequest', () => {
  it('пусто и без вложений — null', () => {
    expect(buildSendRequest({ body: '   ', attachments: [] })).toBeNull();
  });

  it('только текст — body без остальных полей', () => {
    expect(buildSendRequest({ body: '  Харе Кришна  ', attachments: [] })).toEqual({ body: 'Харе Кришна' });
  });

  it('только вложения без текста — разрешено', () => {
    const request = buildSendRequest({ body: '', attachments: [attachment('1')] });
    expect(request).toEqual({ attachments: [attachment('1')] });
  });

  it('текст, ответ и вложения вместе', () => {
    const request = buildSendRequest({ body: 'Ответ', replyToId: 'm0', attachments: [attachment('1')] });
    expect(request).toEqual({ body: 'Ответ', replyToId: 'm0', attachments: [attachment('1')] });
  });

  it('пустой replyToId не попадает в запрос', () => {
    const request = buildSendRequest({ body: 'Текст', replyToId: null, attachments: [] });
    expect(request).toEqual({ body: 'Текст' });
  });
});

describe('buildEditRequest', () => {
  it('пустое тело после trim — null', () => {
    expect(buildEditRequest('   ')).toBeNull();
  });

  it('обрезает пробелы по краям', () => {
    expect(buildEditRequest('  Новый текст  ')).toEqual({ body: 'Новый текст' });
  });
});

describe('canSubmitComposer', () => {
  it('пока грузится вложение — нельзя отправить, даже если есть текст и готовые вложения', () => {
    expect(canSubmitComposer({ editing: false, draft: 'Текст', attachmentsCount: 1, uploading: true })).toBe(false);
  });

  it('обычная отправка: текст или хотя бы одно готовое вложение', () => {
    expect(canSubmitComposer({ editing: false, draft: '  ', attachmentsCount: 0, uploading: false })).toBe(false);
    expect(canSubmitComposer({ editing: false, draft: 'Текст', attachmentsCount: 0, uploading: false })).toBe(true);
    expect(canSubmitComposer({ editing: false, draft: '', attachmentsCount: 1, uploading: false })).toBe(true);
  });

  it('правка требует непустого текста, вложения не считаются', () => {
    expect(canSubmitComposer({ editing: true, draft: '  ', attachmentsCount: 3, uploading: false })).toBe(false);
    expect(canSubmitComposer({ editing: true, draft: 'Новый текст', attachmentsCount: 0, uploading: false })).toBe(true);
  });
});
