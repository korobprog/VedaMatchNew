import type {
  NotificationCategory,
  NotificationEvent,
  NotificationEventName,
  TaskStatusMark,
  WellnessCheckReason,
} from '@vedamatch/shared';
import { workStatusThreadKey } from './inbox-thread';

export type { NotificationCategory };

/** Имена событий литералами: @vedamatch/shared не собирается, и импорт
 *  значения оттуда уронил бы API при старте. Тип сверяет литералы с контрактом.
 *
 *  Здесь только то, что кто-то шлёт в шину: на каждое имя отсюда обязан быть
 *  живой @OnEvent, и это проверяет тест. `portal.welcome` сюда не входит —
 *  его никто не emit'ит, модуль собирает его сам, услышав регистрацию. */
export const notificationEventNames = {
  chatMessageSent: 'union.chat.message-sent',
  portalChatMessageSent: 'chat.message-sent',
  portalChatRequestReceived: 'chat.request-received',
  portalChatCallIncoming: 'chat.call-incoming',
  portalChatCallMissed: 'chat.call-missed',
  portalChatGroupCallStarted: 'chat.group-call-started',
  connectionRequested: 'union.connection.requested',
  connectionAccepted: 'union.connection.accepted',
  astroCompatibilityRequested: 'astro.compatibility.requested',
  astroCompatibilityAccepted: 'astro.compatibility.accepted',
  contactsRequestReceived: 'contacts.request.received',
  contactsRequestAccepted: 'contacts.request.accepted',
  supportReplied: 'support.ticket.replied',
  supportReceived: 'support.ticket.received',
  astroTransitDigestReady: 'astro.transit.digest-ready',
  marketChatMessageSent: 'market.chat.message-sent',
  marketOrderCreated: 'market.order.created',
  marketOrderStatusChanged: 'market.order.status-changed',
  marketListingPublished: 'market.listing.published',
  marketListingPriceDropped: 'market.listing.price-dropped',
  marketReviewReceived: 'market.review.received',
  noticePublished: 'notices.notice.published',
  noticeResponseReceived: 'notices.response.received',
  noticeResponseAccepted: 'notices.response.accepted',
  announcementPublished: 'portal.announcement.published',
  profileEditedByAdmin: 'portal.profile.edited-by-admin',
  motivationReelPublished: 'motivation.reel.published',
  motivationReelRejected: 'motivation.reel.rejected',
  motivationVideoReady: 'motivation.video.ready',
  motivationVideoReview: 'motivation.video.review',
  librarySectionRequestDecided: 'library.section-request.decided',
  teamApplicationReceived: 'team.application.received',
  musicTrackPublished: 'music.track.published',
  musicTrackRejected: 'music.track.rejected',
  musicTrackHiddenByReports: 'music.track.hidden-by-reports',
  musicTrackReviewExpired: 'music.track.review-expired',
  workTaskAssigned: 'work.task.assigned',
  workTaskCommented: 'work.task.commented',
  workTaskReturned: 'work.task.returned',
  workTaskStatusChanged: 'work.task.status-changed',
  workInviteReceived: 'work.invite.received',
  workOvertimeRequested: 'work.overtime.requested',
  workOvertimeDecided: 'work.overtime.decided',
  workPayoutClosed: 'work.payout.closed',
  workPayoutPaid: 'work.payout.paid',
  vacancyResponseCreated: 'vacancies.response.created',
  vacancyResponseStatusChanged: 'vacancies.response.status-changed',
  vacancyOfferClosed: 'vacancies.offer.closed',
  travelBookingCreated: 'travel.booking.created',
  travelBookingStatusChanged: 'travel.booking.status-changed',
  wellnessProductChecked: 'wellness.product.checked',
} as const satisfies Record<string, NotificationEventName>;

/** Подпись вида предложения в «Вакансиях» — событие несёт код. */
const VACANCY_KIND_LABELS: Record<'work' | 'seva' | 'task', string> = {
  work: 'работа',
  seva: 'служение',
  task: 'задача',
};

/**
 * Названия портальных полей профиля для уведомления о правке администрацией.
 * Событие несёт коды — подписи собираются здесь, как и все прочие тексты.
 * Неизвестный код показывается как есть: событие могло прийти из версии API,
 * которая знает поле, а эта сборка — ещё нет.
 */
const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: 'имя',
  spiritualName: 'духовное имя',
  birthDate: 'дата рождения',
  gender: 'пол',
  about: 'рассказ о себе',
  languages: 'языки',
  homeLocation: 'город',
  socialLinks: 'соцсети',
  messengers: 'мессенджеры',
};

export function describeProfileFields(fields: string[]): string {
  return fields.map((field) => PROFILE_FIELD_LABELS[field] ?? field).join(', ');
}

/** Payload веб-пуша ограничен ~4 КБ, да и на экране длинный текст не поместится. */
const excerptLength = 120;

export function toExcerpt(body: string): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= excerptLength) return text;
  return `${text.slice(0, excerptLength - 1)}…`;
}

/**
 * Адрес задачи на доске.
 *
 * Уведомления «Работ» вели на саму доску, и человек, нажав «VED-42: новый
 * комментарий», искал эту задачу глазами среди полусотни чужих карточек.
 * Новость называет задачу — её и открываем.
 *
 * Ключ, а не внутренний идентификатор: он уже есть в событии, написан на
 * карточке, и такой ссылкой можно поделиться словами.
 */
export function workTaskUrl(spaceId: string, taskKey: string): string {
  return `/work/planner/${spaceId}?task=${encodeURIComponent(taskKey)}`;
}

/** Запрос сверх нормы ведёт в задачу, а без задачи — на доску. */
function overtimeUrl(spaceId: string, taskKey: string | null): string {
  return taskKey ? workTaskUrl(spaceId, taskKey) : `/work/planner/${spaceId}`;
}

const CURRENCY_SIGNS: Record<string, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
  INR: '₹',
};

/** 2475000 копеек → «24 750 ₽»; копейки — только когда есть. */
export function formatMoneyMinor(minor: number, currency: string): string {
  const text = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `${text} ${CURRENCY_SIGNS[currency] ?? currency}`;
}

/** Период выплат: «19–25 сентября» или «28 сентября — 2 октября». */
function payoutRange(fromDay: string, toDay: string): string {
  const [, fromMonth, fromDate] = fromDay.split('-').map(Number);
  const [, toMonth, toDate] = toDay.split('-').map(Number);
  const month = (value: number) => MONTHS_GENITIVE[value - 1] ?? '';
  if (fromDay === toDay) return `${toDate} ${month(toMonth)}`;
  return fromMonth === toMonth
    ? `${fromDate}–${toDate} ${month(toMonth)}`
    : `${fromDate} ${month(fromMonth)} — ${toDate} ${month(toMonth)}`;
}

/** 90 → «1 ч 30 мин», 120 → «2 ч». */
function overtimeAmount(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** «24 сентября» или «с 24 сентября по 2 октября» — дни приходят строкой. */
function overtimePeriod(fromDay: string, toDay: string): string {
  const day = (value: string) => {
    const [, month, date] = value.split('-').map(Number);
    return `${date} ${MONTHS_GENITIVE[month - 1] ?? ''}`.trim();
  };
  return fromDay === toDay
    ? day(fromDay)
    : `с ${day(fromDay)} по ${day(toDay)}`;
}

function overtimeTaskTail(
  taskKey: string | null,
  taskTitle: string | null,
): string {
  if (!taskKey) return '';
  return ` · ${taskKey}${taskTitle ? ` «${toExcerpt(taskTitle)}»` : ''}`;
}

/**
 * «3 комментария» — с правильным окончанием, по той же причине, что и ночи.
 *
 * Счёт приезжает в событии числом, а слово подбирает подписчик: издатель
 * сообщает факт, формулировку собираем здесь — правило контракта.
 */
export function commentsWord(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} комментариев`;
  if (last === 1) return `${count} комментарий`;
  if (last >= 2 && last <= 4) return `${count} комментария`;
  return `${count} комментариев`;
}

/**
 * Хвост уведомления о переезде, когда человек ещё и сказал что-то (VED-298).
 *
 * Отдельным уведомлением комментарий в этом случае не едет — он приложен к
 * переезду, и в тексте ему отводится вторая фраза. Пусто, когда перенесли
 * молча: точка после «из «Надо»» и так на месте.
 */
export function workCommentTail(
  excerpt: string | null | undefined,
  count: number | undefined,
): string {
  if (!excerpt) return '';
  const label = (count ?? 1) > 1 ? commentsWord(count ?? 1) : 'Комментарий';
  return `. ${label}: ${toExcerpt(excerpt)}`;
}

/**
 * «3 ночи» — с правильным окончанием: подпись читает человек, а «3 ночь» в
 * пуше выглядит как ошибка сервиса, а не как экономия на склонении.
 */
export function nightsWord(nights: number): string {
  const tail = nights % 100;
  const last = nights % 10;
  if (tail >= 11 && tail <= 14) return `${nights} ночей`;
  if (last === 1) return `${nights} ночь`;
  if (last >= 2 && last <= 4) return `${nights} ночи`;
  return `${nights} ночей`;
}

/**
 * Заголовок решения по заявке. Без рода: у `User.gender` его может не быть —
 * правило всего файла.
 */
export function travelDecisionTitle(
  status: 'accepted' | 'declined' | 'checked_in' | 'completed',
): string {
  switch (status) {
    case 'accepted':
      return 'Заявку на ночлег приняли';
    case 'declined':
      return 'Заявку на ночлег отклонили';
    case 'checked_in':
      return 'Вас отметили как заселённого';
    case 'completed':
      return 'Проживание завершено';
  }
}

export interface NotificationContent {
  title: string;
  body: string;
  url: string;
  tag: string;
  category: NotificationCategory;
  /**
   * Значок состояния (VED-272). Есть только там, где событие принесло
   * название колонки: подписчик собирает пометку из факта, дочитывать её из
   * таблиц «Работы» он не вправе. Остальные уведомления живут без значка.
   */
  mark?: TaskStatusMark | null;
  /**
   * Значок на случай, когда у задачи нет состояния (VED-298): у комментария —
   * «Комментарий». Хранится отдельно от `mark`: переезд карточки переписывает
   * состояние у всех уведомлений о задаче, а вид новости не меняется.
   */
  markFallback?: 'comment';
  /**
   * Ветка новости в ленте (VED-320, `inbox-thread.ts`): есть — у человека
   * лежит одна строка на ключ, и эта новость её обновляет и поднимает; нет —
   * новость ложится своей строкой. В пуш не едет: там своя склейка — `tag`.
   */
  threadKey?: string;
}

/**
 * Единственное место, где живут тексты уведомлений. Сервисы присылают факты,
 * формулировки собираются здесь — поменять копирайт можно, не трогая Union.
 * Формулировки без рода: User.gender необязателен.
 */
export function buildNotification(
  event: NotificationEvent,
): NotificationContent {
  switch (event.name) {
    case 'union.chat.message-sent':
      return {
        title: event.senderName,
        body: toExcerpt(event.body),
        url: `/union/chats/${event.requestId}`,
        tag: `chat:${event.requestId}`,
        category: 'chat',
      };
    case 'chat.message-sent':
      return {
        // В группе и канале первым идёт название беседы: имя отправителя без
        // него не говорит, куда идти, а «Общение» есть у всех уведомлений.
        title: event.conversationTitle
          ? `${event.conversationTitle} · ${event.senderName}`
          : event.senderName,
        body: toExcerpt(event.body),
        url: `/chat/${event.conversationId}`,
        tag: `chat:${event.conversationId}`,
        category: 'chat',
      };
    case 'chat.request-received':
      return {
        title: 'Запрос на переписку',
        body: `${event.senderName}: ${toExcerpt(event.body)}`,
        url: '/chat/requests',
        tag: `chat-request:${event.conversationId}`,
        category: 'chat',
      };
    case 'chat.call-incoming':
      return {
        title: event.callerName,
        body:
          event.callKind === 'video'
            ? 'Входящий видеозвонок'
            : 'Входящий аудиозвонок',
        // Открывает диалог с параметром звонка: страница подхватит его и
        // покажет экран входящего, даже если поток событий ещё не поднялся.
        url: `/chat/${event.conversationId}?call=${event.callId}`,
        tag: `call:${event.callId}`,
        // Не `chat` (VED-361): выключенные «Сообщения» гасили и входящий
        // звонок — при закрытом приложении телефон о нём не узнавал вовсе.
        category: 'calls',
      };
    case 'chat.call-missed':
      return {
        title: event.callerName,
        body:
          event.callKind === 'video'
            ? 'Пропущенный видеозвонок'
            : 'Пропущенный аудиозвонок',
        url: `/chat/${event.conversationId}`,
        tag: `call-missed:${event.conversationId}`,
        // Пропущенный — тот же разговор про звонки: с входящим он обязан
        // включаться и выключаться одним тумблером (VED-361).
        category: 'calls',
      };
    case 'chat.group-call-started':
      return {
        // Первым — название беседы: зовут не «к человеку», а в комнату, и
        // без имени группы уведомление не говорит, куда идти.
        title: event.conversationTitle,
        // «зовёт», а не «начал»: формулировки портала без рода, пол у
        // `User` необязателен.
        body: `${event.starterName} зовёт в групповой звонок`,
        // Без параметра `?call=`, которым ведёт звонок один на один, и это
        // не экономия. Во-первых, в приложении `isCallRelatedPushUrl`
        // (`apps/mobile/.../push/call-push-guard.ts`) глушит на переднем
        // плане всё, где есть `?call=`, — групповое уведомление молча
        // исчезло бы. Во-вторых, `sw.js` подавляет показ, сравнивая
        // `payload.url` с `pathname` открытой вкладки: любой параметр ломает
        // это сравнение, и пуш вылезал бы поверх уже открытой беседы.
        // Входить в комнату параметром и не надо: в беседе есть плашка
        // «идёт звонок», решение остаётся за человеком.
        url: `/chat/${event.conversationId}`,
        // Тег по комнате: повторная волна о том же звонке заменит прежнюю
        // строку в шторке, а не ляжет второй. Префикс `group-call:`, а не
        // `call:` — по `call:` `sw.js` рисует кнопки «Ответить/Отклонить»
        // и держит уведомление на экране, чего групповому звонку не нужно.
        tag: `group-call:${event.callId}`,
        // Зов в комнату — тоже звонок (VED-361). Заглушённая беседа его
        // по-прежнему не поднимает: это приглашение группы, а не вызов лично
        // тебе, — см. `group-call-notify.ts`.
        category: 'calls',
      };
    case 'portal.welcome':
      return {
        /* Обращение по имени в заголовке, а не в теле: в списке уведомлений и
           в пуше видно первую строку, и приветствие «вообще» от приветствия
           человеку отличается именно ею.

           Ведёт на приветственный экран, а не на главную: с главной портал
           начинается с восьми сервисов сразу, и это ровно то место, где
           новый участник теряется. */
        title: `Добро пожаловать, ${event.recipientName}!`,
        body: 'Здесь восемь сервисов: знакомства, общение, практика, знания и рынок. Начните с короткой настройки — подскажем, что открыть первым.',
        url: '/welcome',
        tag: 'welcome',
        /* Та же категория, что у новостей администрации: это обращение
           портала к человеку, а не событие в каком-то из сервисов. Своей
           категории не заводим — её пришлось бы объяснять в настройках, а
           выключать приветствие, которое приходит один раз, незачем. */
        category: 'announcements',
      };
    case 'union.connection.requested':
      return {
        title: 'Новая заявка',
        body: `${event.senderName} хочет познакомиться`,
        url: '/union/connections',
        tag: 'connections',
        category: 'connections',
      };
    case 'astro.compatibility.requested':
      return {
        title: 'Запрос совместимости',
        body: `${event.senderName} хочет сверить астрологическую совместимость`,
        url: '/astro/compatibility',
        tag: 'astro-compatibility',
        category: 'connections',
      };
    case 'astro.compatibility.accepted':
      return {
        title: 'Совместимость открыта',
        body: `${event.senderName} согласился сверить карты — разбор готов`,
        url: '/astro/compatibility',
        tag: 'astro-compatibility',
        category: 'connections',
      };
    case 'union.connection.accepted':
      return {
        title: 'Заявка принята',
        body: `Теперь вы можете общаться с ${event.senderName}`,
        url: `/chat/with/${event.companionId}`,
        tag: 'connections',
        category: 'connections',
      };
    // Справочник переиспользует категорию «connections»: отдельного тумблера
    // в настройках нет, и заводить его — это колонка в БД и миграция.
    // Если понадобится разделить знакомства и справочник, добавлять здесь.
    case 'contacts.request.received':
      return {
        title: 'Запрос контакта',
        body: `${event.senderName} просит способ связаться`,
        url: '/contacts/requests',
        tag: 'contacts-requests',
        category: 'connections',
      };
    case 'contacts.request.accepted':
      return {
        title: 'Контакты открыты',
        body: `Теперь вы видите способы связи с ${event.senderName}`,
        url: `/contacts/users/${event.ownerUserId}`,
        tag: 'contacts-requests',
        category: 'connections',
      };
    case 'support.ticket.replied':
      return {
        title: 'Ответ поддержки',
        body: 'Поддержка ответила на ваше обращение',
        url: `/support/${event.ticketId}`,
        tag: `support:${event.ticketId}`,
        category: 'support',
      };
    case 'support.ticket.received':
      return {
        title: 'Новое обращение в поддержку',
        body: 'Кто-то написал в поддержку — откройте и ответьте',
        url: `/admin/tickets/${event.ticketId}`,
        // Тег по тикету: несколько сообщений подряд в одном обращении
        // заменяют плашку, а не выстраиваются стопкой.
        tag: `support-admin:${event.ticketId}`,
        category: 'support',
      };
    case 'astro.transit.digest-ready':
      return {
        title: 'Персональный день',
        body: toExcerpt(event.excerpt),
        url: '/astro/chart',
        // Один тег на пользователя в сутки: повторный расчёт того же дня
        // заменяет прежнее уведомление, а не плодит второе.
        tag: 'astro-transit',
        category: 'transits',
      };
    // Чат Рынка идёт под общим тумблером «chat»: это та же переписка, и
    // второй переключатель на то же самое только путал бы — так же, как
    // справочник переиспользует «connections» выше.
    case 'market.chat.message-sent':
      return {
        title: event.senderName,
        body: toExcerpt(event.body),
        url: `/market/chats/${event.conversationId}`,
        tag: `market-chat:${event.conversationId}`,
        category: 'chat',
      };
    case 'market.order.created':
      return {
        title: `Заявка №${event.orderNumber}`,
        body: `${event.buyerName} оставил заявку: ${itemsWord(event.itemsCount)}`,
        url: `/market/orders/${event.orderId}`,
        tag: `market-order:${event.orderId}`,
        category: 'market',
      };
    case 'market.order.status-changed':
      return {
        title: `Заявка №${event.orderNumber}`,
        body: `${event.shopName}: ${orderStatusPhrase(event.status)}`,
        // Один тег на заявку: несколько смен статуса подряд заменяют друг
        // друга, а не копятся стопкой.
        tag: `market-order:${event.orderId}`,
        url: `/market/orders/${event.orderId}`,
        category: 'market',
      };
    case 'market.listing.published':
      return {
        title: event.sourceName,
        body: `Новое объявление: ${toExcerpt(event.listingTitle)}`,
        url: `/market/listing/${event.listingId}`,
        // Тег на объявление: подписка на магазин и на его категорию сразу
        // не должна давать два одинаковых пуша.
        tag: `market-listing:${event.listingId}`,
        category: 'market',
      };
    case 'market.listing.price-dropped':
      return {
        title: 'Цена снизилась',
        body: `${toExcerpt(event.listingTitle)}: ${formatMinor(
          event.previousPriceMinor,
          event.currency,
        )} → ${formatMinor(event.priceMinor, event.currency)}`,
        url: `/market/listing/${event.listingId}`,
        tag: `market-price:${event.listingId}`,
        category: 'market',
      };
    case 'portal.profile.edited-by-admin':
      return {
        title: 'Администрация изменила ваш профиль',
        body: toExcerpt(
          event.reason
            ? `Изменено: ${describeProfileFields(event.fields)}. ${event.reason}`
            : `Изменено: ${describeProfileFields(event.fields)}. Откройте профиль и проверьте`,
        ),
        url: '/profile',
        // Тег без даты: несколько правок подряд заменяют плашку, а не копят
        // её — человеку важно последнее состояние профиля, а не история.
        tag: 'profile-edited-by-admin',
        category: 'announcements',
      };
    case 'portal.announcement.published':
      return {
        title: event.title,
        body: toExcerpt(event.excerpt),
        // На страницу новостей, а не на главную: там новость целиком и
        // предыдущие рядом.
        url: '/updates/news',
        // Тег по новости: повторная рассылка не должна множить плашки.
        tag: `announcement:${event.announcementId}`,
        category: 'announcements',
      };
    case 'motivation.reel.published':
      return {
        title: 'Кадр готов, рилс опубликован',
        body: 'Откройте студию: посмотреть, оживить в видео или скачать для Stories',
        // В студию, а не на `/m/<slug>`: та страница сделана для гостей и
        // внешних ссылок, и с кадром на ней ничего не сделать. Автор пришёл по
        // уведомлению доводить рилс до конца, а «Открыть рилс» отсюда ведёт в
        // ленту одним нажатием.
        url: `/motivation/create?reel=${event.reelId}`,
        tag: `motivation-reel:${event.reelId}`,
        category: 'motivation',
      };
    case 'motivation.video.ready':
      return {
        title: 'Ролик готов',
        body: 'Иллюстрация ожила — посмотрите в студии или скачайте для Stories',
        // В студию, как и у кадра: там ролик можно посмотреть и скачать.
        url: `/motivation/create?reel=${event.reelId}`,
        // Тот же тег, что у кадра: плашка о ролике заменяет прежнюю по этому
        // же рилсу, а не ложится второй.
        tag: `motivation-reel:${event.reelId}`,
        category: 'motivation',
      };
    case 'motivation.video.review':
      return {
        title: 'Ролик ждёт приёмки',
        body: 'Автор его пока не видит — посмотрите и примите в очереди',
        url: '/admin/motivation/queue',
        tag: `motivation-video-review:${event.reelId}`,
        category: 'motivation',
      };
    case 'library.section-request.decided':
      return {
        title: event.approved
          ? `Раздел «${event.titleRu}» создан`
          : `Раздел «${event.titleRu}» не создан`,
        body: event.comment
          ? toExcerpt(event.comment)
          : event.approved
            ? 'Можно добавлять в него материалы'
            : 'Администрация отклонила заявку',
        // При отказе вести некуда — открываем справочник целиком.
        url: event.sectionSlug ? `/library/${event.sectionSlug}` : '/library',
        tag: `library-section-request:${event.requestId}`,
        // Своей категории у Образования нет, а заводить её значит добавлять
        // тумблер в настройки: решение по заявке ближе всего к поддержке.
        category: 'support',
      };
    case 'team.application.received':
      return {
        title: 'Новая заявка в команду',
        body: `Кандидат откликнулся: ${event.roleLabel}`,
        url: `/admin/team-applications/${event.applicationId}`,
        tag: `team-application:${event.applicationId}`,
        category: 'support',
      };
    case 'work.task.assigned':
      return {
        title: 'Вам поручили задачу',
        body: `${event.actorName}: ${event.taskKey} «${toExcerpt(event.taskTitle)}» в среде «${event.spaceName}»`,
        url: workTaskUrl(event.spaceId, event.taskKey),
        // Тег по задаче, а не по среде: два поручения подряд — это две
        // новости, и второе не должно затирать первое.
        tag: `work-task:${event.taskKey}`,
        category: 'work',
        mark: event.statusMark,
      };
    case 'work.task.commented':
      return {
        // Несколько реплик за окно дозревания — одна новость, и заголовок
        // говорит сколько, чтобы «новый комментарий» не обманывал (VED-298).
        title:
          event.commentCount > 1
            ? `${event.taskKey}: ${commentsWord(event.commentCount)}`
            : `${event.taskKey}: новый комментарий`,
        body: `${event.actorName}: ${toExcerpt(event.excerpt)}`,
        url: workTaskUrl(event.spaceId, event.taskKey),
        tag: `work-comment:${event.taskKey}`,
        category: 'work',
        mark: event.statusMark,
        // Карточка вне колонок состояния — значок «Комментарий», а не пусто
        // (VED-298): комментарий без пометки терялся среди прочих строк.
        markFallback: 'comment',
      };
    case 'work.task.returned':
      return {
        // Колонку называет ПОМЕТКА, а не заголовок (VED-351, VED-320).
        //
        // Здесь стояло «Задачу вернули в работу» при любом исходе, а из
        // «Выполнено» возвращают и в «Тестерование»: заголовок говорил «в
        // работу», пометка рядом — «Тестерование», и человек читал это как
        // недоделанную работу над пометкой. Вписать сюда настоящую колонку —
        // полумера: пометка с VED-320 показывает состояние на сейчас, карточка
        // уедет дальше, и заголовок разойдётся с ней снова. Поэтому правило на
        // все уведомления «Работы» одно: имя колонки живёт в пометке, в одном
        // месте, а слова говорят о событии — оно своей даты и не меняется.
        title: 'Задачу вернули',
        // Без рода: у `User.gender` его может не быть, а «перенёс» на женском
        // имени читается как чужая ошибка — правило всего файла.
        body: `${event.actorName}: ${event.taskKey} «${toExcerpt(event.taskTitle)}»${workCommentTail(event.commentExcerpt, event.commentCount)}`,
        url: workTaskUrl(event.spaceId, event.taskKey),
        tag: `work-returned:${event.taskKey}`,
        category: 'work',
        mark: event.statusMark,
        // Возврат — та же смена статуса, только в обратную сторону, и в ленте
        // живёт в той же строке, что и прочие переезды карточки.
        threadKey: workStatusThreadKey(
          workTaskUrl(event.spaceId, event.taskKey),
        ),
      };
    case 'work.task.status-changed':
      return {
        // Куда переехала — в пометке, по той же причине, что у возврата выше:
        // заголовок с названием колонки устаревал бы на следующем переносе.
        // Откуда уехала — в тексте, и это не устаревает: «из „В работе“»
        // сказано про прошлое и прошлым останется.
        title: `${event.taskKey}: сменился статус`,
        body: `${event.actorName}: «${toExcerpt(event.taskTitle)}» — из «${event.fromColumnName}»${workCommentTail(event.commentExcerpt, event.commentCount)}`,
        url: workTaskUrl(event.spaceId, event.taskKey),
        // Свой тег, общий для всех переездов задачи: вторая смена колонки
        // затирает первую в шторке — это одна и та же новость, обновившаяся.
        // Поручение (`work-task:`) она при этом не трогает: там новость иная.
        tag: `work-status:${event.taskKey}`,
        category: 'work',
        // Состояние карточки, посчитанное «Работой» по колонке, в которой она
        // осталась после окна дозревания.
        mark: event.statusMark,
        // В ленте — одна строка на задачу, которая поднимается на каждой смене
        // статуса (VED-320). Поручение и комментарий в неё не входят: это
        // другие новости, и комментарий с вопросом не должен пропасть из ленты
        // оттого, что карточку следом передвинули.
        threadKey: workStatusThreadKey(
          workTaskUrl(event.spaceId, event.taskKey),
        ),
      };
    case 'work.payout.closed':
      return event.role === 'lead'
        ? {
            title: 'Период подбит',
            body: `«${event.spaceName}», ${payoutRange(event.fromDay, event.toDay)}: к оплате ${formatMoneyMinor(event.amountMinor, event.currency)}`,
            url: `/work/planner/${event.spaceId}?payouts=1`,
            tag: `work-payout:${event.periodId}`,
            category: 'work',
          }
        : {
            title: 'Вам к выплате',
            body: `${formatMoneyMinor(event.amountMinor, event.currency)} за ${payoutRange(event.fromDay, event.toDay)} — «${event.spaceName}»`,
            url: `/work/planner/${event.spaceId}?payouts=1`,
            tag: `work-payout:${event.periodId}`,
            category: 'work',
          };
    case 'work.payout.paid':
      return {
        title: 'Выплата отмечена оплаченной',
        body: `${formatMoneyMinor(event.amountMinor, event.currency)} за ${payoutRange(event.fromDay, event.toDay)} — «${event.spaceName}»`,
        url: `/work/planner/${event.spaceId}?payouts=1`,
        tag: `work-payout-paid:${event.periodId}`,
        category: 'work',
      };
    case 'work.overtime.requested':
      return {
        title: 'Просят часы сверх нормы',
        body: `${event.actorName}: ${overtimeAmount(event.minutesPerDay)} в день, ${overtimePeriod(event.fromDay, event.toDay)}${overtimeTaskTail(event.taskKey, event.taskTitle)}`,
        url: overtimeUrl(event.spaceId, event.taskKey),
        tag: `work-overtime:${event.requestId}`,
        category: 'work',
      };
    case 'work.overtime.decided':
      return {
        title:
          event.decision === 'approved'
            ? 'Часы сверх нормы одобрены'
            : 'Часы сверх нормы не одобрены',
        body:
          `${event.actorName}: ${overtimeAmount(event.minutesPerDay)} в день, ${overtimePeriod(event.fromDay, event.toDay)}` +
          (event.note ? ` — ${toExcerpt(event.note)}` : ''),
        url: overtimeUrl(event.spaceId, event.taskKey),
        tag: `work-overtime:${event.requestId}`,
        category: 'work',
      };
    case 'work.invite.received':
      return {
        title: 'Приглашение в рабочую среду',
        body: event.inviterName
          ? `${event.inviterName} зовёт вас в «${event.spaceName}» — ${event.roleTitle}`
          : `Вас зовут в «${event.spaceName}» — ${event.roleTitle}`,
        url: event.url,
        tag: `work-invite:${event.spaceName}`,
        category: 'work',
      };
    case 'travel.booking.created':
      return {
        title: 'Заявка на ночлег',
        body: `${event.guestName}: ${event.checkIn} — ${event.checkOut}, ${nightsWord(event.nights)}, «${toExcerpt(event.stayName)}»`,
        url: `/travel/manage/${event.stayId}/bookings`,
        // Тег по заявке, а не по объекту: две заявки подряд — это две
        // новости, и вторая не должна затирать первую.
        tag: `travel-booking:${event.bookingId}`,
        category: 'travel',
      };
    case 'travel.booking.status-changed':
      return {
        title: travelDecisionTitle(event.status),
        body: event.reason
          ? `«${toExcerpt(event.stayName)}»: ${toExcerpt(event.reason)}`
          : `Заявка №${event.bookingNumber} — «${toExcerpt(event.stayName)}»`,
        url: '/travel/bookings',
        tag: `travel-decision:${event.bookingId}`,
        category: 'travel',
      };
    case 'music.track.published':
      return {
        title: 'Запись в каталоге',
        body: `«${toExcerpt(event.title)}» прошла проверку и появилась в Музыке.`,
        url: `/music/tracks/${event.trackId}`,
        tag: `music-track:${event.trackId}`,
        category: 'music',
      };
    case 'wellness.product.checked':
      return wellnessCheckedNotification(event);
    case 'music.track.rejected':
      return {
        title: 'Запись не пошла в каталог',
        // Причина в теле, а не в заголовке: заголовок человек видит в шторке
        // целиком, а причина бывает длинной и там обрежется на полуслове.
        body: toExcerpt(event.reason),
        url: '/music/uploads',
        tag: `music-track:${event.trackId}`,
        category: 'music',
      };
    case 'music.track.hidden-by-reports':
      return {
        title: 'Запись скрыта по жалобам',
        body:
          event.kind === 'copyright'
            ? `«${toExcerpt(event.title)}»: пришла претензия о нарушении прав. Запись убрана из каталога до разбора.`
            : `«${toExcerpt(event.title)}» убрана из каталога до разбора редакцией.`,
        url: '/music/uploads',
        tag: `music-track:${event.trackId}`,
        category: 'music',
      };
    case 'music.track.review-expired':
      return {
        title: 'Запись вернулась вам',
        body: `«${toExcerpt(event.title)}»: за неделю жалобы никто не разобрал. Файл на месте, место в квоте занято.`,
        url: '/music/uploads',
        tag: `music-track:${event.trackId}`,
        category: 'music',
      };
    case 'motivation.reel.rejected':
      return {
        title: 'Рилс не прошёл проверку',
        body: toExcerpt(event.reason),
        // Мастер по этой ссылке покажет причину и даст исправить текст.
        url: `/motivation/create?reel=${event.reelId}`,
        tag: `motivation-reel:${event.reelId}`,
        category: 'motivation',
      };
    case 'market.review.received':
      return {
        title: 'Новый отзыв',
        // Без рода: User.gender необязателен, и «оценил(а)» здесь не нужен —
        // достаточно назвать оценку и автора.
        body: `${event.rating} из 5 — отзыв от ${event.authorName}`,
        url: `/market/shops/${event.shopSlug}`,
        tag: `market-review:${event.shopSlug}`,
        category: 'market',
      };
    case 'notices.notice.published':
      return {
        title: event.sourceName,
        body: toExcerpt(event.noticeTitle),
        url: `/notices/${event.noticeId}`,
        // Тег по источнику подписки, а не по объявлению: пять новых
        // объявлений в рубрике должны схлопнуться в одно уведомление, а не
        // выстроиться пятью подряд.
        tag: `notices:${event.sourceName}`,
        category: 'notices',
      };
    case 'notices.response.received':
      return {
        title: 'Отклик на объявление',
        // Без рода: User.gender необязателен.
        body: `${event.senderName} — «${toExcerpt(event.noticeTitle)}»`,
        url: `/notices/${event.noticeId}`,
        tag: `notice-responses:${event.noticeId}`,
        category: 'notices',
      };
    case 'vacancies.response.created':
      return {
        title: 'Отклик на предложение',
        // Без рода: User.gender необязателен.
        body: `${event.responderName} — «${toExcerpt(event.offerTitle)}»${
          event.message ? `: ${toExcerpt(event.message)}` : ''
        }`,
        url: `/vacancies/${event.offerId}/responses`,
        // Тег по предложению: три отклика подряд схлопываются в одну плашку,
        // а не выстраиваются тремя.
        tag: `vacancy-responses:${event.offerId}`,
        // «Вакансии» живут под тумблером «Работа»: это витрина одного
        // раздела, и второй переключатель на то же самое только путал бы.
        category: 'work',
      };
    case 'vacancies.response.status-changed':
      return {
        title:
          event.status === 'accepted'
            ? 'Ваш отклик принят'
            : event.status === 'declined'
              ? 'По отклику отказ'
              : 'Работодатель открыл диалог',
        // Отказ без причины намеренно: причину пишут в диалоге, если хотят.
        body: `${VACANCY_KIND_LABELS[event.offerKind]} «${toExcerpt(event.offerTitle)}»`,
        url:
          event.status === 'in_dialog'
            ? `/vacancies/${event.offerId}`
            : '/vacancies/responses',
        tag: `vacancy-response:${event.responseId}`,
        category: 'work',
      };
    case 'vacancies.offer.closed':
      return {
        title: 'Предложение закрыто',
        body: `${VACANCY_KIND_LABELS[event.offerKind]} «${toExcerpt(event.offerTitle)}» — человек найден`,
        url: '/vacancies/responses',
        tag: `vacancy-response:${event.responseId}`,
        category: 'work',
      };
    case 'notices.response.accepted':
      return {
        title: 'Ваш отклик принят',
        body: `Контакты открыты: «${toExcerpt(event.noticeTitle)}»`,
        url: '/notices/responses',
        tag: `notice-response:${event.noticeId}`,
        category: 'notices',
      };
  }

  // Тип обещает `NotificationContent`, а `switch` без этой строки молча вернул
  // бы `undefined` — и падение уехало бы к тому, кто читает `content.category`,
  // с сообщением «уведомление undefined». Такое уже случилось с «Музыкой»:
  // издатель забыл продублировать `name` в нагрузке, событие пришло безымянным,
  // и час ушёл на поиск. Здесь имя видно сразу.
  throw new Error(
    `Нет текста для события уведомления: ${JSON.stringify((event as { name?: unknown }).name)}`,
  );
}

const CURRENCY_SYMBOL: Record<string, string> = {
  rub: '₽',
  usd: '$',
  eur: '€',
  inr: '₹',
};

/** Форматирование цены живёт здесь, в слое копирайта: издатель присылает
 *  минорные единицы и валюту, а как это выглядит — решают тексты. */
function formatMinor(minor: number, currency: string): string {
  const major = Math.trunc(minor / 100);
  const fraction = minor % 100;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body =
    fraction === 0
      ? grouped
      : `${grouped},${String(fraction).padStart(2, '0')}`;
  return `${body} ${CURRENCY_SYMBOL[currency] ?? currency}`;
}

/** Склонение без указания рода: User.gender необязателен. */
function itemsWord(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return `${count} позиций`;
  if (last === 1) return `${count} позиция`;
  if (last >= 2 && last <= 4) return `${count} позиции`;
  return `${count} позиций`;
}

function orderStatusPhrase(
  status: Extract<
    NotificationEvent,
    { name: 'market.order.status-changed' }
  >['status'],
): string {
  switch (status) {
    case 'accepted':
      return 'заявка принята';
    case 'in_progress':
      return 'работа начата';
    case 'completed':
      return 'заявка завершена';
    case 'declined_by_seller':
      return 'продавец отклонил заявку';
    case 'cancelled_by_buyer':
      return 'покупатель отменил заявку';
    case 'new_request':
    default:
      return 'заявка обновлена';
  }
}

/**
 * Почему карточка «Здоровья» не принята сама — словами для человека,
 * приславшего снимок (VED-384). Событие несёт коды, тексты живут здесь.
 */
export const WELLNESS_CHECK_REASON_TEXT: Record<WellnessCheckReason, string> = {
  ai_unavailable: 'автопроверка сейчас не работает',
  ai_failed: 'автопроверка не смогла завершиться',
  ai_unreadable: 'ответ автопроверки не удалось разобрать',
  daily_budget: 'автопроверки на сегодня закончились',
  user_daily_limit:
    'за сутки от вас много карточек — остальные смотрит человек',
  not_found: 'товар не нашёлся в открытых источниках',
  sources_conflict: 'источники расходятся между собой',
  too_few_sources: 'товар подтвердил меньше чем два независимых сайта',
  sources_unverified: 'страницы с товаром не удалось открыть для сверки',
  name_mismatch: 'по этому штрихкоду в источниках другой товар',
  composition_unconfirmed: 'состав не удалось подтвердить по источникам',
  composition_mismatch: 'состав в источниках отличается от снимка',
  catalog_matches_differ: 'уточнённый состав меняет ответ по ингредиентам',
  not_food_unconfirmed: 'похоже, это не продукт питания',
  not_food: 'это не продукт питания',
};

const REFINED_FIELD_TEXT: Record<'name' | 'brand' | 'ingredients', string> = {
  name: 'название',
  brand: 'производителя',
  ingredients: 'состав',
};

function wellnessCheckedNotification(
  event: Extract<NotificationEvent, { name: 'wellness.product.checked' }>,
): NotificationContent {
  const product = `«${toExcerpt(event.productName)}»`;
  const published = event.outcome === 'accepted' || event.outcome === 'refined';
  const base = {
    // Опубликованную карточку видно по штрихкоду; остальные — в проверках.
    url: published
      ? `/wellness/products/${encodeURIComponent(event.barcode)}`
      : '/wellness/history',
    // Один тег на карточку: «на проверке у модератора» заменяется решением.
    tag: `wellness-product:${event.productId}`,
    // Своей категории у «Здоровья» нет, а новая — это новый тумблер в
    // настройках. Решение по присланному, как и заявка в Библиотеке, ближе
    // всего к поддержке.
    category: 'support' as const,
  };
  const reason = event.reasons[0]
    ? WELLNESS_CHECK_REASON_TEXT[event.reasons[0]]
    : null;

  switch (event.outcome) {
    case 'accepted':
      return {
        ...base,
        title: 'Продукт добавлен в базу',
        body:
          event.decidedBy === 'ai'
            ? `${product}: нашли в открытых источниках, состав совпал со снимком. Теперь его найдут все по штрихкоду.`
            : `${product} проверил модератор. Теперь его найдут все по штрихкоду.`,
      };
    case 'refined': {
      const fields = event.refined.map((field) => REFINED_FIELD_TEXT[field]);
      return {
        ...base,
        title: 'Продукт добавлен с уточнениями',
        body: fields.length
          ? `${product}: сверили с открытыми источниками и уточнили ${fields.join(', ')}. Теперь его найдут все по штрихкоду.`
          : `${product}: сверили с открытыми источниками. Теперь его найдут все по штрихкоду.`,
      };
    }
    case 'review':
      return {
        ...base,
        title: 'Продукт на проверке у модератора',
        body: reason
          ? `${product}: ${reason}. Модератор посмотрит сам — ответ придёт сюда же.`
          : `${product}: модератор посмотрит сам — ответ придёт сюда же.`,
      };
    case 'rejected':
      return {
        ...base,
        title: 'Продукт не добавлен',
        body:
          event.decidedBy === 'moderator' && event.comment
            ? `${product}: ${toExcerpt(event.comment)}`
            : `${product}: ${reason ?? 'карточку отклонили'}.`,
      };
  }
}
