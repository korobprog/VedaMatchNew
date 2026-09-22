/**
 * Куда ведёт карточка каталога (VED-335).
 *
 * По умолчанию сервисы открываются на сайте в браузере — так было с VED-174,
 * и для большинства это правильно: дублировать в приложении восемь витрин
 * никто не станет.
 *
 * Но сканер состава — исключение по существу, а не по вкусу: камеры в браузере
 * на телефоне либо нет, либо она требует https и отдельного разрешения, а сам
 * смысл сервиса в том, чтобы навести телефон на полку. Поэтому у «Здоровья»
 * есть свой экран в приложении, и карточка ведёт туда.
 *
 * Список, а не `if` по месту: следующий сервис со своим экраном допишется
 * строкой, и будет видно, каких сервисов это касается, не читая экран.
 */
const IN_APP: Record<string, string> = {
  wellness: '/wellness/scan',
};

export type ServiceTarget =
  | { kind: 'in-app'; path: string }
  | { kind: 'site'; url: string };

/**
 * `url` карточки у сервисов внутри монолита — относительный путь (`/wellness`),
 * его и подставляем в адрес сайта. Слаг проверяется без учёта регистра: в
 * каталоге он заводится руками из админки.
 */
export function serviceTarget(
  service: { slug: string; url: string },
): ServiceTarget {
  const path = IN_APP[service.slug.trim().toLowerCase()];
  return path ? { kind: 'in-app', path } : { kind: 'site', url: service.url };
}

/** Есть ли у сервиса свой экран в приложении — для подписи на карточке. */
export function hasInAppScreen(slug: string): boolean {
  return Boolean(IN_APP[slug.trim().toLowerCase()]);
}
