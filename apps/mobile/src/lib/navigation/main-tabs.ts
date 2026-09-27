import type { TabIconName } from '@/components/tab-icon';

/**
 * Вкладки нижнего меню — в том порядке, в каком они стоят слева направо.
 * `app/(tabs)/_layout.tsx` объявляет экраны по этому списку, а `Tabs` из
 * `expo-router` рисует их в порядке объявления.
 *
 * «Сервисы» — по центру, под большим пальцем: это вход во всё, чего нет в
 * меню (Знакомства, Медиатека, Блог-лента, Здоровье, «Настройки»), и
 * открывают его чаще, чем справочник людей и общины. Так попросил
 * пользователь: «кнопка Сервисы посередине, где сейчас Люди, а Люди —
 * правее». «Чаты» остаются первыми — с них приложение открывается.
 */
export const MAIN_TABS: readonly { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: 'Чаты', icon: 'chats' },
  { name: 'calls', title: 'Звонки', icon: 'calls' },
  { name: 'services', title: 'Сервисы', icon: 'services' },
  { name: 'people', title: 'Люди', icon: 'people' },
  { name: 'communities', title: 'Общины', icon: 'communities' },
];
