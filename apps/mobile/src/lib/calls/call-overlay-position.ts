/**
 * Где можно рисовать плавающие оверлеи звонков (`IncomingCallBanner`,
 * `ReturnToCallBanner`, `CallErrorToast`) поверх текущего экрана, не
 * закрывая системную шапку `Stack`-маршрута или нижнее меню вкладок.
 *
 * Повод: `ReturnToCallBanner` рисовался на фиксированном `insets.top + 10`
 * и на `chat/[id]` (своя системная шапка) заезжал на кнопку «назад», имя
 * собеседника и кнопки звонка — найдено на живом устройстве. Провайдер
 * рисует баннеры вне навигатора (`call-provider.tsx`), поэтому
 * `useHeaderHeight()` там не видит шапку активного экрана — вместо этого
 * решаем по текущему пути: какие маршруты сами включают `headerShown: true`
 * (`chat/[id].tsx`, `chat/requests.tsx`, `communities/[id].tsx`,
 * `people/[id].tsx` — списки по тем же путям без `/id` шапки не показывают,
 * это вкладки) и какие — вкладки с нижним меню
 * (`app/(tabs)/_layout.tsx`).
 */

/** Высота системной шапки Android (native-stack, стандартный Material app bar). */
export const ANDROID_HEADER_HEIGHT_DP = 56;

/** Высота нижнего меню без запаса под safe-area — `(tabs)/_layout.tsx`, `height: 60 + insets.bottom`. */
export const TAB_BAR_HEIGHT_DP = 60;

const TAB_ROUTES: ReadonlySet<string> = new Set(['/', '/calls', '/people', '/communities', '/services']);

/** Маршрут сам включает системную шапку (`headerShown: true` в самом экране). */
export function pathnameHasSystemHeader(pathname: string): boolean {
  if (pathname.startsWith('/chat/')) return true;
  if (/^\/communities\/[^/]+$/.test(pathname)) return true;
  if (/^\/people\/[^/]+$/.test(pathname)) return true;
  return false;
}

/** Маршрут — одна из вкладок нижнего меню (список, а не карточка/чат). */
export function pathnameHasTabBar(pathname: string): boolean {
  return TAB_ROUTES.has(pathname);
}

/** Отступ сверху для оверлея: safe-area плюс высота шапки, если она есть на этом маршруте. */
export function overlayTopOffset(pathname: string, safeAreaTop: number): number {
  return safeAreaTop + (pathnameHasSystemHeader(pathname) ? ANDROID_HEADER_HEIGHT_DP : 0);
}

/** Отступ снизу для оверлея: safe-area плюс высота нижнего меню, если оно есть на этом маршруте. */
export function overlayBottomOffset(pathname: string, safeAreaBottom: number): number {
  return safeAreaBottom + (pathnameHasTabBar(pathname) ? TAB_BAR_HEIGHT_DP : 0);
}
