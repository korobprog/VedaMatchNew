import type { CreateSupportTicketRequest, SupportTicketCategory } from '@vedamatch/shared';
import {
  SUPPORT_ORIGINS,
  SUPPORT_SUBJECT_MAX,
  composeSupportMessage,
  messageRoom,
  type SupportOrigin,
} from './device-report';

/**
 * Черновик обращения в поддержку (VED-336) и его проверка до отправки.
 *
 * Проверки повторяют серверные (`requireText` в support.service.ts), но
 * срабатывают раньше: отказ сервера после нажатия стоит человеку лимита —
 * создание обращения ограничено пятью в час.
 */
export interface SupportDraft {
  category: SupportTicketCategory;
  subject: string;
  message: string;
  /** Приложить абзац со сведениями об устройстве. */
  attachDevice: boolean;
}

/** Пустой черновик. С экрана ошибки тема и категория подставлены заранее. */
export function initialSupportDraft(origin: SupportOrigin | null): SupportDraft {
  if (!origin) return { category: 'other', subject: '', message: '', attachDevice: true };
  const preset = SUPPORT_ORIGINS[origin];
  return { category: preset.category, subject: preset.subject, message: '', attachDevice: true };
}

export type SupportDraftCheck =
  | { ok: true; request: CreateSupportTicketRequest }
  | { ok: false; field: 'subject' | 'message'; error: string };

/**
 * Проверка перед отправкой. `report` — абзац сведений ровно в том виде, в
 * каком он показан человеку; при выключенном переключателе не учитывается.
 */
export function checkSupportDraft(draft: SupportDraft, report: string): SupportDraftCheck {
  const subject = draft.subject.trim();
  const message = draft.message.trim();
  const attached = draft.attachDevice ? report : '';

  if (!subject) return { ok: false, field: 'subject', error: 'Напишите тему — пару слов о вопросе.' };
  if (subject.length > SUPPORT_SUBJECT_MAX) {
    return { ok: false, field: 'subject', error: `Тема длиннее ${SUPPORT_SUBJECT_MAX} знаков — сократите её.` };
  }
  if (!message) {
    return { ok: false, field: 'message', error: 'Опишите, что случилось: что делали и что пошло не так.' };
  }
  const room = messageRoom(attached);
  if (message.length > room) {
    return {
      ok: false,
      field: 'message',
      error: `Текст длиннее ${room} знаков — сократите его${attached ? ' или не прикладывайте сведения' : ''}.`,
    };
  }

  return {
    ok: true,
    request: { subject, category: draft.category, message: composeSupportMessage(message, attached) },
  };
}
