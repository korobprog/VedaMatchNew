import type {
  AssistantLinkCard,
  ChatSearchState,
  CommunitySearchResponse,
  ContactsSearchResponse,
  PortalSearchResponse,
} from '@vedamatch/shared';

/**
 * Выдача поиска по порталу в приложении (VED-337): из ответов четырёх
 * источников — группы для экрана.
 *
 * Источники те же, что у сайта, новых ручек нет:
 *
 * - `GET /assistant/search` — материалы сервисов (Образование, Библиотека,
 *   Музыка, Вдохновение, Объявления, Рынок, Здоровье). Это ровно поиск
 *   страницы `/search` на сайте;
 * - `GET /chat/people/search` — люди, как в справочнике «Люди»;
 * - `GET /communities?q=` — общины;
 * - `GET /chat/search` — своя переписка.
 *
 * Последние три сайт показывает в своих разделах, а приложение сводит в одну
 * выдачу: люди, общины и беседы в приложении свои, нативные, и поиск, который
 * их не находит, был бы поиском «за пределами приложения».
 *
 * Куда ведёт строка, решается здесь, а не в экране: что есть в приложении
 * своим экраном — открывается им, остальное — на сайте тем же путём, каким
 * «Сервисы» открывают сервис.
 *
 * Модуль чистый — под тестом и порядок групп, и разбор адресов.
 */

/** Куда ведёт строка выдачи. */
export type SearchTarget =
  | { kind: 'route'; pathname: string; params: Record<string, string> }
  | { kind: 'site'; path: string };

export interface SearchItem {
  key: string;
  title: string;
  subtitle: string | null;
  target: SearchTarget;
  accessibilityLabel: string;
}

export interface SearchGroup {
  id: string;
  title: string;
  items: SearchItem[];
}

/** Ответ одного источника: пришёл, упал или не спрашивали (короткий запрос). */
export type SourceOutcome<T> = { status: 'ok'; data: T } | { status: 'failed' } | { status: 'skipped' };

export interface SearchOutcomes {
  people: SourceOutcome<ContactsSearchResponse>;
  communities: SourceOutcome<CommunitySearchResponse>;
  chats: SourceOutcome<ChatSearchState>;
  portal: SourceOutcome<PortalSearchResponse>;
}

/** По пять строк из источника — как у сайта: выдача — оглавление, а не лента. */
export const SEARCH_PER_GROUP = 5;

/**
 * Подписи сервисов — те же, что у выдачи на сайте
 * (`SERVICE_LABELS`, `apps/web/src/components/assistant/assistant-share.ts`).
 * «Образование» — это `library`, «Библиотека» — `vedabase`: так их называет
 * каталог, и путать здесь нельзя.
 */
export const PORTAL_SERVICE_LABELS: Record<string, string> = {
  library: 'Образование',
  vedabase: 'Библиотека',
  music: 'Музыка',
  motivation: 'Вдохновение',
  notices: 'Объявления',
  market: 'Рынок',
  wellness: 'Здоровье',
};

export function serviceLabel(slug: string): string {
  return PORTAL_SERVICE_LABELS[slug] ?? slug;
}

/** Что ищется — для подсказки на пустом поле. */
export const SEARCH_SCOPE_HINT =
  'Люди, общины, ваша переписка и материалы сервисов: Образование, Библиотека, Музыка, Вдохновение, Объявления, Рынок и Здоровье.';

/**
 * Куда ведёт карточка сервиса. Своим экраном в приложении открывается
 * только товар «Здоровья» — экран ответа сканера по штрихкоду
 * (`app/wellness/result/[barcode].tsx`); всё прочее — сайт по тому же пути.
 * Чужой адрес (не с `/`) на сайт не превращается: карточку без пути
 * открыть нечем.
 */
export function portalCardTarget(href: string): SearchTarget | null {
  const path = href.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const wellness = /^\/wellness\/products\/(\d{8,14})\/?(?:[?#].*)?$/.exec(path);
  if (wellness) {
    return {
      kind: 'route',
      pathname: '/wellness/result/[barcode]',
      params: { barcode: wellness[1], kind: 'manual' },
    };
  }
  return { kind: 'site', path };
}

function joinParts(parts: (string | null | undefined)[]): string | null {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(' · ');
  return text || null;
}

/** Строка без переносов и лишних пробелов, обрезанная по слову. */
export function snippet(text: string | null | undefined, max = 90): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trim()}…`;
}

function label(title: string, subtitle: string | null, where: string): string {
  return [title, subtitle, where].filter(Boolean).join('. ');
}

function peopleGroup(data: ContactsSearchResponse): SearchGroup | null {
  const items = data.items.slice(0, SEARCH_PER_GROUP).map((person): SearchItem => {
    // Имя уже разрешено сервером (`resolveDisplayName`): духовное, если есть.
    const subtitle = joinParts([person.statusLine ?? person.headline, person.city]);
    return {
      key: `person:${person.userId}`,
      title: person.name,
      subtitle,
      target: { kind: 'route', pathname: '/people/[id]', params: { id: person.userId } },
      accessibilityLabel: label(person.name, subtitle, 'Профиль'),
    };
  });
  return items.length ? { id: 'people', title: 'Люди', items } : null;
}

function communitiesGroup(data: CommunitySearchResponse): SearchGroup | null {
  const items = data.items.slice(0, SEARCH_PER_GROUP).map((community): SearchItem => {
    const subtitle = joinParts([community.city, `участников: ${community.membersCount}`]);
    return {
      key: `community:${community.id}`,
      title: community.name,
      subtitle,
      // Те же параметры, что передаёт вкладка «Общины»: экран общины берёт
      // название из адреса и не ходит за ним отдельным запросом.
      target: {
        kind: 'route',
        pathname: '/communities/[id]',
        params: {
          id: community.id,
          name: community.name,
          kind: community.kind,
          city: community.city ?? '',
          isVerified: community.isVerified ? '1' : '',
        },
      },
      accessibilityLabel: label(community.name, subtitle, 'Община'),
    };
  });
  return items.length ? { id: 'communities', title: 'Общины', items } : null;
}

function chatsGroup(data: ChatSearchState): SearchGroup | null {
  // Одна беседа — одна строка: пять совпадений в одном чате не должны
  // вытеснить остальные беседы. Сервер отдаёт свежие сверху, первое
  // попавшееся и есть последнее по времени.
  const seen = new Set<string>();
  const items: SearchItem[] = [];
  for (const hit of data.hits) {
    const id = hit.conversation.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const text = snippet(hit.message.body);
    const subtitle = text ? `${hit.message.author.name}: ${text}` : hit.message.author.name;
    items.push({
      key: `chat:${id}`,
      title: hit.conversation.title,
      subtitle,
      target: { kind: 'route', pathname: '/chat/[id]', params: { id } },
      accessibilityLabel: label(hit.conversation.title, subtitle, 'Переписка'),
    });
    if (items.length === SEARCH_PER_GROUP) break;
  }
  return items.length ? { id: 'chats', title: 'Переписка', items } : null;
}

function portalGroups(data: PortalSearchResponse): SearchGroup[] {
  return data.groups
    .map((group): SearchGroup => {
      const title = serviceLabel(group.service);
      const items = group.items
        .slice(0, SEARCH_PER_GROUP)
        .map((card: AssistantLinkCard, index): SearchItem | null => {
          const target = portalCardTarget(card.href);
          if (!target) return null;
          const subtitle = joinParts([card.subtitle, snippet(card.body, 70)]);
          return {
            key: `${group.service}:${card.href}:${index}`,
            title: card.title,
            subtitle,
            target,
            accessibilityLabel: label(card.title, subtitle, target.kind === 'site' ? `${title}, откроется на сайте` : title),
          };
        })
        .filter((item): item is SearchItem => item !== null);
      return { id: `service:${group.service}`, title, items };
    })
    .filter((group) => group.items.length > 0);
}

export type SearchView =
  /** Все источники упали — вероятнее всего, нет сети. */
  | { kind: 'error' }
  /** Никто ничего не нашёл. `unavailable` — кто не ответил и мог бы найти. */
  | { kind: 'empty'; unavailable: string[] }
  | { kind: 'results'; groups: SearchGroup[]; unavailable: string[] };

/**
 * Выдача целиком. Порядок: сначала то, что открывается в приложении
 * (люди, общины, переписка), потом сервисы — в порядке сервера.
 *
 * Упавший источник не роняет выдачу, но называется в `unavailable`: иначе
 * «ничего не нашлось» нельзя отличить от «Рынок не успел ответить». Сервисы,
 * которые не успели внутри портального поиска, называются тем же списком.
 */
export function buildSearchView(outcomes: SearchOutcomes): SearchView {
  const asked = Object.values(outcomes).filter((outcome) => outcome.status !== 'skipped');
  if (asked.length > 0 && asked.every((outcome) => outcome.status === 'failed')) return { kind: 'error' };

  const groups: SearchGroup[] = [];
  const unavailable: string[] = [];

  const add = (group: SearchGroup | null) => {
    if (group) groups.push(group);
  };

  if (outcomes.people.status === 'ok') add(peopleGroup(outcomes.people.data));
  else if (outcomes.people.status === 'failed') unavailable.push('Люди');

  if (outcomes.communities.status === 'ok') add(communitiesGroup(outcomes.communities.data));
  else if (outcomes.communities.status === 'failed') unavailable.push('Общины');

  if (outcomes.chats.status === 'ok') add(chatsGroup(outcomes.chats.data));
  else if (outcomes.chats.status === 'failed') unavailable.push('Переписка');

  if (outcomes.portal.status === 'ok') {
    groups.push(...portalGroups(outcomes.portal.data));
    unavailable.push(...outcomes.portal.data.unavailable.map(serviceLabel));
  } else if (outcomes.portal.status === 'failed') {
    unavailable.push('материалы сервисов');
  }

  return groups.length ? { kind: 'results', groups, unavailable } : { kind: 'empty', unavailable };
}

/** «Не успели ответить: Рынок, Люди.» — пусто, если ответили все. */
export function unavailableNote(unavailable: readonly string[]): string | null {
  if (!unavailable.length) return null;
  return `Не успели ответить: ${unavailable.join(', ')}. Повторите поиск чуть позже — там могло найтись ещё.`;
}
