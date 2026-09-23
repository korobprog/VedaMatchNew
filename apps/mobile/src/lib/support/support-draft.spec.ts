import { SUPPORT_MESSAGE_MAX, SUPPORT_SUBJECT_MAX, messageRoom } from './device-report';
import { checkSupportDraft, initialSupportDraft } from './support-draft';

const REPORT = '— Сведения из приложения —\nПриложение: VedaMatch 0.1.0';

describe('initialSupportDraft', () => {
  it('из аккаунта — пустая форма, «Другое», сведения включены', () => {
    expect(initialSupportDraft(null)).toEqual({ category: 'other', subject: '', message: '', attachDevice: true });
  });

  it('с экрана ошибки — тема и «Техническая проблема» подставлены', () => {
    const draft = initialSupportDraft('chat');
    expect(draft.subject).toBe('Не открывается переписка');
    expect(draft.category).toBe('technical');
  });
});

describe('checkSupportDraft', () => {
  const draft = { category: 'technical' as const, subject: ' Тема ', message: ' Текст ', attachDevice: true };

  it('собирает запрос: тема и текст обрезаны, сведения дописаны', () => {
    expect(checkSupportDraft(draft, REPORT)).toEqual({
      ok: true,
      request: { subject: 'Тема', category: 'technical', message: `Текст\n\n${REPORT}` },
    });
  });

  it('выключенные сведения не уходят', () => {
    const result = checkSupportDraft({ ...draft, attachDevice: false }, REPORT);
    expect(result.ok && result.request.message).toBe('Текст');
  });

  it('без темы — ошибка у поля темы', () => {
    expect(checkSupportDraft({ ...draft, subject: '   ' }, REPORT)).toMatchObject({ ok: false, field: 'subject' });
  });

  it('тема на пределе проходит, на знак длиннее — нет', () => {
    expect(checkSupportDraft({ ...draft, subject: 'я'.repeat(SUPPORT_SUBJECT_MAX) }, REPORT).ok).toBe(true);
    expect(checkSupportDraft({ ...draft, subject: 'я'.repeat(SUPPORT_SUBJECT_MAX + 1) }, REPORT)).toMatchObject({
      ok: false,
      field: 'subject',
    });
  });

  it('без текста — ошибка у поля текста', () => {
    expect(checkSupportDraft({ ...draft, message: '' }, REPORT)).toMatchObject({ ok: false, field: 'message' });
  });

  it('предел текста учитывает приложенные сведения и подсказывает их выключить', () => {
    const room = messageRoom(REPORT);
    expect(checkSupportDraft({ ...draft, message: 'я'.repeat(room) }, REPORT).ok).toBe(true);
    const over = checkSupportDraft({ ...draft, message: 'я'.repeat(room + 1) }, REPORT);
    expect(over).toMatchObject({ ok: false, field: 'message' });
    expect(!over.ok && over.error).toContain('не прикладывайте сведения');
    // Без сведений тот же текст помещается.
    expect(checkSupportDraft({ ...draft, message: 'я'.repeat(room + 1), attachDevice: false }, REPORT).ok).toBe(true);
  });

  it('без сведений предел — ровно серверный', () => {
    const over = checkSupportDraft({ ...draft, attachDevice: false, message: 'я'.repeat(SUPPORT_MESSAGE_MAX + 1) }, REPORT);
    expect(!over.ok && over.error).toBe(`Текст длиннее ${SUPPORT_MESSAGE_MAX} знаков — сократите его.`);
  });
});
