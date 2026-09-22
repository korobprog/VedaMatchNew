/**
 * Что в профиле правится только на сайте — и куда за этим идти.
 *
 * Список здесь, а не строкой прямо в экране, ровно потому, что он обязан
 * меняться вместе с формой: как только приложение научится править очередное
 * поле, строка о нём должна уйти отсюда. Тест рядом стережёт то, что молча
 * теряется, — в первом раунде оценки плашка перечисляла город, языки и
 * контакты, но умалчивала про этап пути и духовную линию, и человек не
 * узнавал, что анкету знакомства можно пройти заново (дефект 4).
 *
 * Адрес собирает `serviceUrl` — тот же помощник, которым пользуются
 * вкладки-заглушки (`components/site-placeholder.tsx`): контур сборки решает,
 * `vedamatch.ru` это или `vedamatch.com`.
 */

import { serviceUrl } from '@/config/services';

export interface ProfileSiteLink {
  id: string;
  /** Подпись кнопки. */
  label: string;
  /** Что именно там правится — без этого кнопка не объясняет себя. */
  description: string;
  /** Раздел сайта. */
  path: string;
}

export const PROFILE_SITE_LINKS: ProfileSiteLink[] = [
  {
    id: 'profile',
    label: 'Открыть профиль на сайте',
    description: 'Город, языки, дата рождения, пол, соцсети и мессенджеры — их в приложении пока нет.',
    path: '/profile',
  },
  {
    id: 'self-identification',
    label: 'Пройти знакомство заново',
    description:
      'Этап пути и духовная линия приходят из анкеты знакомства. Из приложения её не пройти заново — только на сайте.',
    path: '/self-identification',
  },
];

export function profileSiteUrl(webOrigin: string, link: ProfileSiteLink): string {
  return serviceUrl(webOrigin, link.path);
}
