import type {
  NotificationCategory,
  NotificationEvent,
  NotificationEventName,
} from '@vedamatch/shared';

export type { NotificationCategory };

/** Имена событий литералами: @vedamatch/shared не собирается, и импорт
 *  значения оттуда уронил бы API при старте. Тип сверяет литералы с контрактом. */
export const notificationEventNames = {
  chatMessageSent: 'union.chat.message-sent',
  portalChatMessageSent: 'chat.message-sent',
  portalChatRequestReceived: 'chat.request-received',
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
} as const satisfies Record<string, NotificationEventName>;

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

export interface NotificationContent {
  title: string;
  body: string;
  url: string;
  tag: string;
  category: NotificationCategory;
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
        url: event.sectionSlug
          ? `/library/${event.sectionSlug}`
          : '/library',
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
    case 'music.track.published':
      return {
        title: 'Запись в каталоге',
        body: `«${toExcerpt(event.title)}» прошла проверку и появилась в Музыке.`,
        url: `/music/tracks/${event.trackId}`,
        tag: `music-track:${event.trackId}`,
        category: 'music',
      };
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
