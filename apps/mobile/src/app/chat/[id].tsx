import type {
  ChatAttachmentInput,
  ChatConversationDetail,
  ChatMessageDto,
  ChatReplyPreview,
} from '@vedamatch/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { AttachmentSheet } from '@/components/chat/attachment-sheet';
import { CallHeaderButtons } from '@/components/calls/call-header-buttons';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { VoiceRecorderControl } from '@/components/chat/voice/voice-recorder-control';
import { canOpenMessageMenuWhileRecording } from '@/lib/chat/voice/voice-composer-lock';
import { ChatKeyboardAvoidingView as KeyboardAvoidingView } from '@/components/keyboard-controller-web';
import { MessageBubble } from '@/components/chat/message-bubble';
import { MessageMenu } from '@/components/chat/message-menu';
import { MessagesSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import {
  addAttachment,
  buildEditRequest,
  buildSendRequest,
  canSubmitComposer,
  enterEditMode,
  exitEditMode,
  removeAttachmentAt,
  restoreReplyAfterEdit,
  toAttachmentInput,
} from '@/lib/chat/chat-composer-state';
import { attachmentLabel, formatChatDivider, isNewDay, officialNotifyLabel, readonlyNotice } from '@/lib/chat/chat-format';
import {
  applyReadByOther,
  applyRoomEvent,
  buildPendingMessage,
  dropPendingMessage,
  prependOlder,
  settlePendingMessage,
} from '@/lib/chat/chat-room-state';
import { applyOptimisticReaction, rollbackReaction } from '@/lib/chat/chat-reactions';
import { useChatStream } from '@/lib/chat/chat-stream';
import {
  ALLOWED_FILE_MIME,
  canPickAttachment,
  normalizePickedDocument,
  normalizePickedImage,
  remainingAttachmentSlots,
  uploadDenialMessage,
  validateUpload,
  type NormalizedUpload,
} from '@/lib/chat/chat-upload-rules';
import { buildUploadFormPart } from '@/lib/chat/chat-upload-part';
import { setActiveConversation } from '@/lib/push/active-chat';
import { withPlural } from '@/lib/chat/plural';
import { isOnline } from '@/lib/chat/presence';
import { confirmTap, longPressTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/** Лимит длины сообщения, как на сервере (`CHAT_MESSAGE_MAX_LENGTH`). */
const MAX_LENGTH = 2000;
/** Не чаще раза в три секунды, как сайт: событие «печатает» живёт пять. */
const TYPING_THROTTLE_MS = 3_000;
const TYPING_VISIBLE_MS = 5_000;

type Row = { kind: 'message'; message: ChatMessageDto; divider: string | null };

/**
 * Одна загрузка вложения — от выбора файла до готового `ChatAttachmentInput`
 * (тогда слот исчезает, а результат уходит в `attachments`) или ошибки.
 * Каждый выбор — свой слот со своим `id`: раньше общий `uploadError` одной
 * неудачи затирал другую при выборе нескольких фото подряд (раунд оценки 002).
 */
interface UploadSlot {
  id: string;
  candidate: NormalizedUpload;
  status: 'uploading' | 'error';
  error?: string;
  /** Отказ по типу/размеру не имеет смысла повторять тем же файлом. */
  retryable: boolean;
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const { api, user } = useSession();
  const stream = useChatStream();
  const chatApi = useMemo(() => createChatApi(api), [api]);

  // Пока беседа на экране, пуши о её сообщениях не показываются.
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);

  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [typingName, setTypingName] = useState<string | null>(null);
  const [mutedBusy, setMutedBusy] = useState(false);
  const [mutedError, setMutedError] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const myId = user?.id ?? '';

  // Ответ и правка — состояние композера (VED-167). Черновик поля один на
  // оба режима: при входе в правку он откладывается и возвращается при
  // отмене (`chat-composer-state.ts`, приём с сайта). Начатый ответ
  // откладывается тем же приёмом — иначе он молча терялся при входе в правку.
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [editing, setEditing] = useState<ChatMessageDto | null>(null);
  const [draftBeforeEdit, setDraftBeforeEdit] = useState<string | null>(null);
  const [replyBeforeEdit, setReplyBeforeEdit] = useState<ChatMessageDto | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachmentInput[]>([]);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [uploadSlots, setUploadSlots] = useState<UploadSlot[]>([]);
  // Ошибка самого выбора (лимит, отказ в разрешении, картинку не удалось
  // разобрать) — отдельно от ошибок конкретной загрузки (`uploadSlots`),
  // это не про файл, а про действие «открыть галерею/камеру/файл».
  const [pickError, setPickError] = useState<string | null>(null);
  const [menuMessage, setMenuMessage] = useState<ChatMessageDto | null>(null);
  // Голосовое (VED-286): поле ввода прячется на время записи — печатать и
  // говорить в микрофон разом нельзя (приём с сайта, `chat-composer.tsx`).
  // Таймер и волна рисуются внутри самого `VoiceRecorderControl` — экрану
  // нужен только факт «идёт запись», чтобы спрятать текстовое поле.
  const [voiceRecording, setVoiceRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);

  /**
   * Отложенный фокус поля после «Ответить»/«Изменить»/отмены правки.
   * Меню сообщения — системный `Modal` с fade-анимацией закрытия; пока окно
   * диалога ещё держит фокус (~250 мс), `TextInput.focus()` выставляет
   * `focused="true"` в дереве, но клавиатуру не поднимает — Android не
   * получает событие показа IME, пока фокус формально не у Activity
   * (`mInputShown=false`, раунд оценки 003). Ждём дольше анимации закрытия.
   */
  const focusComposerSoon = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const markRead = useCallback(() => {
    chatApi.markRead(conversationId).catch(() => undefined);
  }, [chatApi, conversationId]);

  const load = useCallback(async () => {
    try {
      const next = await chatApi.detail(conversationId);
      setDetail(next);
      setMessages((current) => {
        // Черновики, ещё не получившие ответа, переживают перечитывание.
        const pending = current.filter((message) => message.id.startsWith('pending:'));
        return [...next.messages, ...pending];
      });
      setHasMore(next.hasMore);
      setError(null);
      markRead();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть беседу');
    }
  }, [chatApi, conversationId, markRead]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offEvents = stream.subscribe((event) => {
      if (!('conversationId' in event) || event.conversationId !== conversationId) return;
      if (event.type === 'typing') {
        if (event.user.id === myId) return;
        setTypingName(event.user.name);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTypingName(null), TYPING_VISIBLE_MS);
        return;
      }
      if (event.type === 'read') {
        if (event.userId !== myId && detail?.kind === 'direct') {
          setMessages((current) => applyReadByOther(current, myId, event.lastReadAt));
        }
        return;
      }
      setMessages((current) => applyRoomEvent(current, event, conversationId));
      if (event.type === 'message.created' && event.message.author.id !== myId) {
        setTypingName(null);
        markRead();
      }
    });
    const offResync = stream.onResync(() => void load());
    return () => {
      offEvents();
      offResync();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [stream, conversationId, myId, detail?.kind, load, markRead]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((message) => !message.id.startsWith('pending:'));
    if (!hasMore || loadingOlder || !oldest) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.detail(conversationId, oldest.createdAt);
      setMessages((current) => prependOlder(current, page.messages));
      setHasMore(page.hasMore);
    } catch {
      // Следующая прокрутка вверх попробует снова.
    } finally {
      setLoadingOlder(false);
    }
  }, [chatApi, conversationId, hasMore, loadingOlder, messages]);

  const onChangeDraft = useCallback(
    (text: string) => {
      setDraft(text);
      const now = Date.now();
      if (text.trim() && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
        lastTypingSent.current = now;
        chatApi.typing(conversationId).catch(() => undefined);
      }
    },
    [chatApi, conversationId],
  );

  const anyUploading = uploadSlots.some((slot) => slot.status === 'uploading');

  const send = useCallback(async () => {
    if (!user) return;
    // Пока грузится хоть одно вложение — не отправлять: иначе сообщение
    // уходит без файла, а чип прицепляется уже к следующему (раунд оценки
    // 002). Кнопка и так неактивна (`canSubmit`), проверка здесь — на
    // случай второго источника вызова (Enter/клавиатура).
    if (anyUploading) return;
    const request = buildSendRequest({ body: draft, replyToId: replyTo?.id, attachments });
    if (!request) return;
    const bodyText = draft.trim();
    const replyPreview: ChatReplyPreview | null = replyTo
      ? { id: replyTo.id, authorName: replyTo.author.name, body: replyTo.body, attachmentKind: replyTo.attachments[0]?.kind ?? null }
      : null;
    const pending = buildPendingMessage({
      seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      body: bodyText,
      now: new Date(),
      attachments,
      replyTo: replyPreview,
    });
    const sentAttachments = attachments;
    const sentReply = replyTo;
    confirmTap();
    setDraft('');
    setAttachments([]);
    setReplyTo(null);
    setSendError(null);
    setMessages((current) => [...current, pending]);
    try {
      const saved = await chatApi.send(conversationId, request);
      setMessages((current) => settlePendingMessage(current, pending.id, saved));
    } catch (e) {
      // Черновик, вложения и плашка ответа возвращаются — можно отправить ещё раз.
      setMessages((current) => dropPendingMessage(current, pending.id));
      setDraft((current) => current || bodyText);
      setAttachments(sentAttachments);
      setReplyTo(sentReply);
      setSendError(e instanceof Error ? e.message : 'Сообщение не отправлено');
    }
  }, [anyUploading, attachments, chatApi, conversationId, draft, replyTo, user]);

  /**
   * Голосовое уходит сразу, файл уже загружен рекордером — черновик
   * текста и ждущие вложения не трогаем, это отдельное сообщение (приём
   * с сайта, `chat-composer.tsx: sendVoice`).
   */
  const sendVoice = useCallback(
    (attachment: ChatAttachmentInput) => {
      if (!user) return;
      const pending = buildPendingMessage({
        seed: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
        body: '',
        now: new Date(),
        attachments: [attachment],
      });
      confirmTap();
      setSendError(null);
      setMessages((current) => [...current, pending]);
      void (async () => {
        try {
          const saved = await chatApi.send(conversationId, { attachments: [attachment] });
          setMessages((current) => settlePendingMessage(current, pending.id, saved));
        } catch (e) {
          setMessages((current) => dropPendingMessage(current, pending.id));
          setSendError(e instanceof Error ? e.message : 'Голосовое не отправилось');
        }
      })();
    },
    [chatApi, conversationId, user],
  );

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const request = buildEditRequest(draft);
    if (!request) return;
    confirmTap();
    setSendError(null);
    setSending(true);
    try {
      const saved = await chatApi.edit(editing.id, request);
      setMessages((current) => applyRoomEvent(current, { type: 'message.updated', conversationId, message: saved }, conversationId));
      setEditing(null);
      setDraft(draftBeforeEdit ?? '');
      setDraftBeforeEdit(null);
      // Ответ, начатый до правки, возвращается и здесь — что при отмене, что
      // при успешном сохранении: правка не должна тихо стирать то, что
      // человек уже собирался отправить следующим (раунд оценки 003).
      const restored = restoreReplyAfterEdit(replyBeforeEdit);
      setReplyTo(restored.replyTo);
      setReplyBeforeEdit(restored.replyBeforeEdit);
    } catch (e) {
      // Текст остаётся в поле в режиме правки — можно поправить и повторить.
      setSendError(e instanceof Error ? e.message : 'Не сохранилось, попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  }, [chatApi, conversationId, draft, draftBeforeEdit, editing, replyBeforeEdit]);

  const onComposerSubmit = useCallback(() => {
    if (editing) void saveEdit();
    else void send();
  }, [editing, saveEdit, send]);

  const cancelReply = useCallback(() => setReplyTo(null), []);

  const cancelEdit = useCallback(() => {
    const result = exitEditMode(draftBeforeEdit);
    setDraft(result.draft);
    setDraftBeforeEdit(result.draftBeforeEdit);
    setEditing(null);
    // Ответ, начатый до правки, возвращается — он был отложен, не потерян.
    const restored = restoreReplyAfterEdit(replyBeforeEdit);
    setReplyTo(restored.replyTo);
    setReplyBeforeEdit(restored.replyBeforeEdit);
    setSendError(null);
    focusComposerSoon();
  }, [draftBeforeEdit, replyBeforeEdit, focusComposerSoon]);

  // FlatList перевёрнут: новые снизу, данные в обратном порядке.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = messages.map((message, index) => ({
      kind: 'message',
      message,
      divider: isNewDay(messages[index - 1], message) ? formatChatDivider(message.createdAt) : null,
    }));
    return out.reverse();
  }, [messages]);

  /** Уведомления официального канала выключены по умолчанию и включаются только здесь. */
  const toggleMuted = useCallback(async () => {
    if (!detail) return;
    const next = !detail.muted;
    confirmTap();
    setMutedBusy(true);
    setMutedError(null);
    try {
      const result = await chatApi.setMuted(conversationId, next);
      setDetail((current) => (current ? { ...current, muted: result.muted } : current));
    } catch {
      setMutedError('Не получилось, попробуйте ещё раз');
    } finally {
      setMutedBusy(false);
    }
  }, [chatApi, conversationId, detail]);

  const showAuthors = detail ? detail.kind !== 'direct' : false;

  // ===== Меню долгого нажатия: ответить, реакция, копировать, изменить, удалить =====

  const openMenu = useCallback((message: ChatMessageDto) => {
    longPressTap();
    setMenuMessage(message);
  }, []);

  const closeMenu = useCallback(() => setMenuMessage(null), []);

  const startReply = useCallback(
    (message: ChatMessageDto) => {
      setReplyTo(message);
      closeMenu();
      // Плашка видна сразу — курсор идёт в поле, а не остаётся на пункте меню.
      focusComposerSoon();
    },
    [closeMenu, focusComposerSoon],
  );

  const copyMessage = useCallback(
    (message: ChatMessageDto) => {
      void Clipboard.setStringAsync(message.body);
      closeMenu();
    },
    [closeMenu],
  );

  const startEdit = useCallback(
    (message: ChatMessageDto) => {
      const result = enterEditMode({
        currentEditingId: editing?.id ?? null,
        nextMessage: message,
        currentDraft: draft,
        savedDraft: draftBeforeEdit,
      });
      setDraft(result.draft);
      setDraftBeforeEdit(result.draftBeforeEdit);
      setEditing(message);
      // Начатый ответ откладывается тем же приёмом, что черновик — только на
      // первый вход, иначе переключение между правками затрёт отложенное.
      setReplyBeforeEdit((current) => (editing ? current : replyTo));
      setReplyTo(null);
      setSendError(null);
      closeMenu();
      focusComposerSoon();
    },
    [closeMenu, draft, draftBeforeEdit, editing, replyTo, focusComposerSoon],
  );

  const confirmDelete = useCallback(
    (message: ChatMessageDto) => {
      closeMenu();
      Alert.alert('Удалить сообщение?', undefined, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await chatApi.remove(message.id);
                setMessages((current) =>
                  applyRoomEvent(current, { type: 'message.deleted', conversationId, messageId: message.id }, conversationId),
                );
              } catch (e) {
                Alert.alert('Не получилось', e instanceof Error ? e.message : 'Сообщение не удалено, попробуйте ещё раз');
              }
            })();
          },
        },
      ]);
    },
    [chatApi, closeMenu, conversationId],
  );

  const reactToMessage = useCallback(
    (message: ChatMessageDto, emoji: string) => {
      // Снимок только реакций этого сообщения — не всей ленты: если снимок
      // всей ленты откатить на ошибке, пропадёт всё, что пришло за время
      // запроса (новые сообщения из потока, своя отправка, чужая правка).
      const previousReactions = message.reactions;
      // Предсказание сразу, не дожидаясь сети — откатывается на ошибке.
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, reactions: applyOptimisticReaction(item.reactions, emoji) } : item,
        ),
      );
      void (async () => {
        try {
          const result = await chatApi.setReaction(message.id, emoji);
          setMessages((current) =>
            applyRoomEvent(
              current,
              { type: 'reaction.set', conversationId, messageId: message.id, reactions: result.reactions },
              conversationId,
            ),
          );
        } catch {
          setMessages((current) => rollbackReaction(current, message.id, previousReactions));
          Alert.alert('Не получилось', 'Реакция не поставилась, попробуйте ещё раз');
        }
      })();
    },
    [chatApi, conversationId],
  );

  const onMenuReact = useCallback(
    (message: ChatMessageDto, emoji: string) => {
      closeMenu();
      reactToMessage(message, emoji);
    },
    [closeMenu, reactToMessage],
  );

  // ===== Вложения: галерея, камера, файл =====

  // «Занятые» места — готовые вложения и те, что прямо сейчас грузятся:
  // camera даёт один файл за раз и раньше не видела чужих слотов вовсе.
  const occupiedAttachmentSlots = attachments.length + uploadSlots.filter((slot) => slot.status === 'uploading').length;

  const performUpload = useCallback(
    async (slotId: string, candidate: NormalizedUpload) => {
      try {
        // Байты, не `{uri,name,type}` — та форма падала под `expo`-fetch
        // с «Unsupported FormDataPart implementation» для фото/файлов точно
        // так же, как раньше падала для голосового (feedback-003,
        // блокирующий п.1; разбор — `chat-upload-part.ts`).
        const form = new FormData();
        form.append('file', (await buildUploadFormPart(candidate)) as unknown as Blob);
        const result = await chatApi.upload(conversationId, form);
        setAttachments((current) => addAttachment(current, toAttachmentInput(result, candidate.name)));
        setUploadSlots((current) => current.filter((slot) => slot.id !== slotId));
      } catch (e) {
        // Причина — в консоль (может быть текстом стороннего fetch на
        // английском, ничего не говорящим без контекста); человеку — всегда
        // понятная фраза по-русски, не `e.message`.
        // eslint-disable-next-line no-console
        console.warn('[chat] загрузка вложения не удалась', e);
        setUploadSlots((current) =>
          current.map((slot) => (slot.id === slotId ? { ...slot, status: 'error', error: 'Файл не загрузился' } : slot)),
        );
      }
    },
    [chatApi, conversationId],
  );

  const uploadCandidate = useCallback(
    async (candidate: NormalizedUpload) => {
      const slotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const denial = validateUpload({ mimeType: candidate.type, sizeBytes: candidate.sizeBytes });
      if (denial) {
        // Свой слот на каждый файл: неудача одного больше не затирает ошибку
        // другого при выборе нескольких фото подряд (раунд оценки 002).
        setUploadSlots((current) => [
          ...current,
          { id: slotId, candidate, status: 'error', error: uploadDenialMessage(denial), retryable: false },
        ]);
        return;
      }
      setUploadSlots((current) => [...current, { id: slotId, candidate, status: 'uploading', retryable: true }]);
      await performUpload(slotId, candidate);
    },
    [performUpload],
  );

  const retrySlot = useCallback(
    (slotId: string, candidate: NormalizedUpload) => {
      // Ошибочные слоты место не занимают (см. `occupiedAttachmentSlots`),
      // поэтому лимит можно было набрать десятью готовыми вложениями и всё
      // равно повторить старую неудачу — файл ушёл бы в хранилище, а
      // `addAttachment` молча отбросил бы результат (раунд оценки 003).
      if (!canPickAttachment(occupiedAttachmentSlots)) {
        setPickError('Нельзя прикрепить больше 10 вложений в одно сообщение');
        return;
      }
      setUploadSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, status: 'uploading', error: undefined } : slot)));
      void performUpload(slotId, candidate);
    },
    [occupiedAttachmentSlots, performUpload],
  );

  const removeUploadSlot = useCallback((slotId: string) => {
    setUploadSlots((current) => current.filter((slot) => slot.id !== slotId));
  }, []);

  const pickFromGallery = useCallback(async () => {
    setPickError(null);
    const remaining = remainingAttachmentSlots(occupiedAttachmentSlots);
    if (remaining <= 0) {
      setPickError('Нельзя прикрепить больше 10 вложений в одно сообщение');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const normalized = normalizePickedImage(asset);
      if (!normalized) {
        setPickError('Не удалось определить тип фото');
        continue;
      }
      await uploadCandidate(normalized);
    }
  }, [occupiedAttachmentSlots, uploadCandidate]);

  const pickFromCamera = useCallback(async () => {
    setPickError(null);
    // Лимит проверяется до похода в камеру — иначе снимок всё равно уходит
    // в хранилище лишней загрузкой, а `addAttachment` потом молча его
    // отбрасывает без объяснения (раунд оценки 002).
    if (!canPickAttachment(occupiedAttachmentSlots)) {
      setPickError('Нельзя прикрепить больше 10 вложений в одно сообщение');
      return;
    }
    // Разрешение спрашивается только тут, не при открытии приложения.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPickError('Нет доступа к камере. Разрешите доступ в настройках телефона.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const normalized = asset ? normalizePickedImage(asset) : null;
    if (!normalized) {
      setPickError('Не удалось получить фото с камеры');
      return;
    }
    await uploadCandidate(normalized);
  }, [occupiedAttachmentSlots, uploadCandidate]);

  const pickDocument = useCallback(async () => {
    setPickError(null);
    if (!canPickAttachment(occupiedAttachmentSlots)) {
      setPickError('Нельзя прикрепить больше 10 вложений в одно сообщение');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: Array.from(ALLOWED_FILE_MIME), multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    const normalized = asset ? normalizePickedDocument(asset) : null;
    if (!normalized) {
      setPickError('Не удалось определить тип файла');
      return;
    }
    await uploadCandidate(normalized);
  }, [occupiedAttachmentSlots, uploadCandidate]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((current) => removeAttachmentAt(current, index));
  }, []);

  const renderRow = useCallback<ListRenderItem<Row>>(
    ({ item }) => (
      <View>
        {item.divider ? (
          <Text style={[styles.divider, { color: colors.text1, backgroundColor: colors.bg1 }]}>{item.divider}</Text>
        ) : null}
        <MessageBubble
          message={item.message}
          mine={item.message.author.id === myId}
          showAuthor={showAuthors}
          onLongPress={canOpenMessageMenuWhileRecording(voiceRecording) ? openMenu : undefined}
          onReactionPress={reactToMessage}
        />
      </View>
    ),
    [colors, myId, showAuthors, openMenu, reactToMessage, voiceRecording],
  );
  const subtitle = detail
    ? detail.kind === 'direct'
      ? isOnline(detail.companion?.lastSeenAt)
        ? 'в сети'
        : ''
      : withPlural(detail.membersCount, detail.kind === 'channel' ? 'подписчик' : 'участник', detail.kind === 'channel' ? 'подписчика' : 'участника', detail.kind === 'channel' ? 'подписчиков' : 'участников')
    : '';

  const canSubmit = canSubmitComposer({
    editing: Boolean(editing),
    draft,
    attachmentsCount: attachments.length,
    uploading: anyUploading,
  });
  const attachDisabled = anyUploading || voiceRecording || !canPickAttachment(occupiedAttachmentSlots);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {/* Системная шапка: стрелка «назад» и жест платформы, а не нарисованные
          вручную. Аватар и имя — содержимое заголовка. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text0,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={[detail?.title, typingName ? 'печатает' : subtitle].filter(Boolean).join(', ')}
              style={[styles.headerTitleRow, { maxWidth: width - 96 }]}
            >
              {detail ? (
                <ChatAvatar
                  id={detail.companion?.id ?? detail.id}
                  name={detail.title}
                  uri={detail.kind === 'direct' ? detail.companion?.avatarUrl : detail.avatarUrl}
                  size={36}
                />
              ) : null}
              <View style={styles.headerText}>
                <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text0 }]}>
                  {detail?.title ?? ' '}
                </Text>
                {typingName || subtitle ? (
                  <Text numberOfLines={1} style={[styles.headerSub, { color: typingName ? colors.cyan : colors.text2 }]}>
                    {typingName ? `${detail?.kind === 'direct' ? '' : `${typingName} `}печатает…` : subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          ),
          // Только кнопки — остальная шапка (заголовок, стрелка назад) вне
          // зоны звонков, см. VedaMatchNew-mobile-coordination.md.
          headerRight: () => <CallHeaderButtons conversation={detail} />,
        }}
      />

      {/* Поле ввода идёт за клавиатурой кадр в кадр. Положение этого блока
          меряется без системной шапки над ним, поэтому её высота прибавляется.
          Высота клавиатуры на Android уже включает системную панель, а у поля
          ввода свой отступ под неё: он вычитается, чтобы не было зазора. */}
      <KeyboardAvoidingView
        style={styles.root}
        behavior="padding"
        keyboardVerticalOffset={headerHeight - insets.bottom}
      >
        {!detail && error ? (
          <View style={styles.center}>
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.info, { color: colors.text1 }]}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.retry, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
            >
              <Text style={[styles.retryText, { color: colors.text0 }]}>Повторить</Text>
            </Pressable>
          </View>
        ) : !detail ? (
          <MessagesSkeleton />
        ) : rows.length === 0 ? (
          // Пустая беседа — вне перевёрнутого списка: на Android пустой
          // элемент такого списка отображался зеркально.
          <View style={[styles.center, styles.emptyChat]}>
            <Text style={[styles.info, { color: colors.text1 }]}>Сообщений пока нет. Напишите первым.</Text>
          </View>
        ) : (
          <FlatList
            inverted
            data={rows}
            keyExtractor={(row) => row.message.id}
            renderItem={renderRow}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={colors.text1} /> : null}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {detail ? (
          detail.canWrite ? (
            <View style={[styles.composer, { borderTopColor: colors.glassBorder, paddingBottom: insets.bottom + 8, backgroundColor: colors.bg0 }]}>
              {sendError ? (
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.sendError, { color: colors.magenta }]}>
                  {sendError}
                </Text>
              ) : null}

              {replyTo && !editing ? (
                <View style={[styles.banner, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                  <View style={styles.bannerText}>
                    <Text numberOfLines={1} style={[styles.bannerAuthor, { color: colors.violet }]}>
                      {replyTo.author.name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.bannerBody, { color: colors.text1 }]}>
                      {replyTo.body || attachmentLabel(replyTo.attachments[0]?.kind ?? 'file')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Отменить ответ"
                    onPress={cancelReply}
                    android_ripple={ripple(colors.glassBorder, true)}
                    style={styles.bannerClose}
                  >
                    <Text style={[styles.bannerCloseText, { color: colors.text1 }]}>✕</Text>
                  </Pressable>
                </View>
              ) : null}

              {editing ? (
                <View style={[styles.banner, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                  <View style={styles.bannerText}>
                    <Text style={[styles.bannerAuthor, { color: colors.text0 }]}>Изменение сообщения</Text>
                    <Text numberOfLines={1} style={[styles.bannerBody, { color: colors.text1 }]}>
                      было: «{editing.body}»
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Отменить изменение"
                    onPress={cancelEdit}
                    android_ripple={ripple(colors.glassBorder, true)}
                    style={styles.bannerClose}
                  >
                    <Text style={[styles.bannerCloseText, { color: colors.text1 }]}>✕</Text>
                  </Pressable>
                </View>
              ) : null}

              {pickError ? (
                <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.sendError, { color: colors.magenta }]}>
                  {pickError}
                </Text>
              ) : null}

              {attachments.length > 0 || uploadSlots.length > 0 ? (
                <View style={styles.attachmentsRow}>
                  {attachments.map((attachment, index) => (
                    <View key={`${attachment.key}-${index}`} style={[styles.chip, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
                      <Text numberOfLines={1} style={[styles.chipText, { color: colors.text1 }]}>
                        {attachment.title || attachmentLabel(attachment.kind)}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Убрать вложение"
                        onPress={() => removeAttachment(index)}
                        android_ripple={ripple(colors.glassBorder, true)}
                        style={styles.chipRemoveBox}
                      >
                        <Text style={[styles.chipRemove, { color: colors.text1 }]}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                  {uploadSlots
                    .filter((slot) => slot.status === 'uploading')
                    .map((slot) => (
                      <View
                        key={slot.id}
                        style={[styles.chip, styles.chipLoading, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}
                      >
                        <ActivityIndicator size="small" color={colors.text1} />
                        <Text style={[styles.chipText, { color: colors.text1 }]}>Загрузка…</Text>
                      </View>
                    ))}
                </View>
              ) : null}

              {/* Каждая неудачная загрузка — своя строка: несколько ошибок
                  подряд (выбрали два фото, оба не загрузились) не затирают
                  друг друга, у каждой свой «Повторить»/«Убрать». */}
              {uploadSlots
                .filter((slot) => slot.status === 'error')
                .map((slot) => (
                  <View key={slot.id} style={styles.uploadErrorRow}>
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={[styles.sendError, styles.uploadErrorText, { color: colors.magenta }]}
                    >
                      {slot.error}
                    </Text>
                    {slot.retryable ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Повторить загрузку"
                        onPress={() => retrySlot(slot.id, slot.candidate)}
                        android_ripple={ripple(colors.glassBorder)}
                        style={({ pressed }) => [styles.retrySmall, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
                      >
                        <Text style={[styles.retrySmallText, { color: colors.text0 }]}>Повторить</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Убрать вложение"
                      onPress={() => removeUploadSlot(slot.id)}
                      android_ripple={ripple(colors.glassBorder, true)}
                      style={styles.chipRemoveBox}
                    >
                      <Text style={[styles.chipRemove, { color: colors.text1 }]}>✕</Text>
                    </Pressable>
                  </View>
                ))}

              <View style={styles.composerRow}>
                {!editing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Вложение"
                    accessibilityState={{ disabled: attachDisabled }}
                    disabled={attachDisabled}
                    onPress={() => {
                      // Иначе после отмены системной галереи/камеры Android
                      // сам возвращает фокус и открывает клавиатуру (раунд
                      // оценки 002) — а поле в этот момент прячется под листом.
                      inputRef.current?.blur();
                      setAttachSheetOpen(true);
                    }}
                    android_ripple={ripple(colors.glassBorder, true)}
                    style={({ pressed }) => [
                      styles.attachButton,
                      { borderColor: colors.glassBorder, backgroundColor: colors.glass },
                      attachDisabled && styles.attachButtonDisabled,
                      pressedStyle(pressed),
                    ]}
                  >
                    <Svg width={20} height={20} viewBox="0 0 24 24">
                      <Path d="M12 5v14" stroke={colors.text1} strokeWidth={2} strokeLinecap="round" />
                      <Path d="M5 12h14" stroke={colors.text1} strokeWidth={2} strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                ) : null}
                {!voiceRecording ? (
                  <TextInput
                    ref={inputRef}
                    value={draft}
                    onChangeText={onChangeDraft}
                    placeholder={editing ? 'Новый текст сообщения' : 'Сообщение'}
                    placeholderTextColor={colors.text1}
                    multiline
                    maxLength={MAX_LENGTH}
                    style={[styles.input, { color: colors.text0, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
                  />
                ) : null}
                {/* `&& !voiceRecording`: если вложение (например, фото) доезжает
                    из другой загрузки прямо во время записи, `canSubmit` может
                    стать true без участия человека — без этого условия
                    `VoiceRecorderControl` тут же размонтировался бы посреди
                    активной записи в обход `useFocusEffect`, единственного
                    надёжного места, которое успевает остановить рекордер
                    ДО размонтирования (feedback-002, п.1/2).
                    `|| editing` тем же способом мог бы размонтировать
                    контрол через вход в правку сообщения (меню долгого
                    нажатия → «Изменить») — этот путь закрыт не здесь, а
                    выше по цепочке: `renderRow` не даёт открыть меню вовсе,
                    пока `voiceRecording`, см. `canOpenMessageMenuWhileRecording`
                    (feedback-003, блокирующий п.2) — `editing` во время
                    записи поэтому никогда не станет `true`. */}
                {(canSubmit && !voiceRecording) || editing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={editing ? 'Сохранить' : 'Отправить'}
                    accessibilityState={{ disabled: !canSubmit || sending, busy: sending }}
                    disabled={!canSubmit || sending}
                    onPress={onComposerSubmit}
                    android_ripple={ripple(colors.glassBorder, true)}
                    style={({ pressed }) => [
                      styles.sendButton,
                      { backgroundColor: canSubmit ? colors.mint : colors.bg2 },
                      pressedStyle(pressed),
                    ]}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color={canSubmit ? colors.onMint : colors.text1} />
                    ) : editing ? (
                      <Svg width={20} height={20} viewBox="0 0 24 24">
                        <Path
                          d="M4.5 12.5 9 17l10.5-11"
                          stroke={canSubmit ? colors.onMint : colors.text1}
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    ) : (
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Path
                          d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                          stroke={canSubmit ? colors.onMint : colors.text1}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                    )}
                  </Pressable>
                ) : (
                  <VoiceRecorderControl
                    conversationId={conversationId}
                    chatApi={chatApi}
                    onSent={sendVoice}
                    onRecordingChange={(recording) => setVoiceRecording(recording)}
                  />
                )}
              </View>
            </View>
          ) : (
            <View style={[styles.readonly, { borderTopColor: colors.glassBorder, paddingBottom: insets.bottom + 12 }]}>
              <Text style={[styles.info, { color: colors.text2 }]}>{readonlyNotice(detail)}</Text>
              {detail.official ? (
                <>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !detail.muted, busy: mutedBusy }}
                    disabled={mutedBusy}
                    onPress={() => void toggleMuted()}
                    android_ripple={ripple(colors.glassBorder)}
                    style={({ pressed }) => [
                      styles.notify,
                      detail.muted
                        ? { backgroundColor: colors.mint, borderColor: colors.mint }
                        : { borderColor: colors.glassBorder },
                      mutedBusy && { opacity: 0.7 },
                      pressedStyle(pressed),
                    ]}
                  >
                    <Text style={[styles.notifyText, { color: detail.muted ? colors.onMint : colors.text0 }]}>
                      {officialNotifyLabel(detail.muted)}
                    </Text>
                  </Pressable>
                  {mutedError ? (
                    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.info, { color: colors.magenta }]}>
                      {mutedError}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          )
        ) : null}
      </KeyboardAvoidingView>

      <MessageMenu
        message={menuMessage}
        myUserId={myId}
        onClose={closeMenu}
        onReact={onMenuReact}
        onReply={startReply}
        onCopy={copyMessage}
        onEdit={startEdit}
        onDelete={confirmDelete}
      />
      <AttachmentSheet
        visible={attachSheetOpen}
        onClose={() => setAttachSheetOpen(false)}
        onPickGallery={() => void pickFromGallery()}
        onPickCamera={() => void pickFromCamera()}
        onPickFile={() => void pickDocument()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: fonts.bodyBold, fontSize: 17 },
  headerSub: { fontFamily: fonts.body, fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  info: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyChat: { justifyContent: 'flex-end', paddingBottom: 40 },
  retry: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 20, justifyContent: 'center', overflow: 'hidden' },
  retryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  list: { paddingVertical: 12 },
  older: { paddingVertical: 12 },
  divider: {
    alignSelf: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginVertical: 10,
  },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  bannerText: { flex: 1, minWidth: 0, gap: 1 },
  bannerAuthor: { fontFamily: fonts.bodyBold, fontSize: 12 },
  bannerBody: { fontFamily: fonts.body, fontSize: 13 },
  bannerClose: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  bannerCloseText: { fontSize: 16 },
  uploadErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  uploadErrorText: { flex: 1 },
  // Было minHeight: 32 (≈84 px на 420dpi) — меньше 44dp, найдено в раунде
  // оценки 002.
  retrySmall: { minHeight: hitTarget, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, justifyContent: 'center' },
  retrySmallText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  attachmentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingLeft: 10,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 13, maxWidth: 150 },
  // Готовый чип высотой 44 за счёт `chipRemoveBox` (44×44); у чипа
  // «Загрузка…» такого элемента нет — без своих отступов он был заметно
  // ниже, и ряд прыгал по высоте (раунд оценки 003).
  chipLoading: { minHeight: hitTarget, paddingRight: 12, gap: 6 },
  // Был глиф 14px с hitSlop={8} (≈40dp по факту) — зона нажатия меньше 44dp,
  // найдено в раунде оценки 002. Сам `Pressable` теперь 44×44, не только
  // расширенная зона вокруг маленькой иконки.
  chipRemoveBox: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center' },
  chipRemove: { fontSize: 14 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  attachButton: { width: hitTarget, height: hitTarget, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  attachButtonDisabled: { opacity: 0.5 },
  input: {
    flex: 1,
    minHeight: hitTarget,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  sendButton: { width: hitTarget + 2, height: hitTarget + 2, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendError: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  readonly: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  notify: {
    alignSelf: 'center',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  notifyText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
