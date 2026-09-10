/**
 * «Отправить приглашение в чат».
 *
 * Своего списка друзей здесь нет и не нужно: у портала есть общий экран
 * отправки `/chat/share`, которым уже пользуются Объявления, Рынок и
 * ассистент. Он показывает настоящие беседы человека и сам заводит сообщение —
 * «Работа» про устройство чата не знает, только про адрес и поля карточки.
 * Заодно это снимает главную беду именного приглашения: звать можно тех, с кем
 * действительно переписываются, а не только тех, кто попал в граф знакомств.
 *
 * Ссылка едет в `body`, а не в заголовке: заголовок карточки короткий и
 * показывается в списке бесед, а ссылку человек копирует из текста. Токен при
 * этом проходит через адресную строку своего же портала — там, куда он и так
 * направляется; ссылка одноразовая, живёт неделю и отзывается кнопкой.
 */
const MAX_TITLE = 80;

export interface WorkInviteShare {
  spaceId: string;
  spaceName: string;
  /** Роль словом: «участник», «наблюдатель», «администратор». */
  roleTitle: string;
  /** Полная ссылка приглашения; показывается один раз после создания. */
  url: string;
}

export function buildWorkInviteShareHref(invite: WorkInviteShare): string {
  const params = new URLSearchParams({
    kind: "work",
    title: shareTitle(invite.spaceName),
    subtitle: `Роль: ${invite.roleTitle}`,
    body: "Приглашение одноразовое и действует неделю.",
    sourceService: "work",
    // Токен, а не id среды: по этой паре карточка сама соберёт внутренний
    // адрес `/work/join/<токен>` и покажет кнопку. Полный адрес в сообщение не
    // кладём — чат принимает в `url` только объекты своего хранилища, и это
    // правильно: он рисует его как `<a href>`, и чужой домен узнавал бы IP
    // получателя. См. chat-card-link.ts.
    sourceId: inviteToken(invite.url),
  });
  return `/chat/share?${params.toString()}`;
}

/**
 * Токен из полной ссылки приглашения. Полный адрес собран на сервере по
 * `WEB_ORIGIN` и может отличаться от домена, с которого смотрит человек; токен
 * одинаков, а маршрут карточка подставит свой.
 */
export function inviteToken(url: string): string {
  const marker = "/work/join/";
  const at = url.indexOf(marker);
  return at === -1 ? url : url.slice(at + marker.length);
}

/** Длинное название среды режем: заголовок карточки стоит в одну строку. */
export function shareTitle(spaceName: string): string {
  const name = spaceName.trim() || "рабочая среда";
  const title = `Приглашение в «${name}»`;
  if (title.length <= MAX_TITLE) return title;
  return `${title.slice(0, MAX_TITLE - 2)}…»`;
}
