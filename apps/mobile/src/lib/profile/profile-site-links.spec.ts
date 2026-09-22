import { PROFILE_SITE_LINKS, profileSiteUrl } from './profile-site-links';

/**
 * Список «правится на сайте». Проверяется не вёрстка, а честность: что
 * названо всё, чего в приложении нет, и что адреса собираются по контуру
 * сборки.
 */

describe('PROFILE_SITE_LINKS', () => {
  it('каждая строка объясняет себя и ведёт в раздел сайта', () => {
    for (const link of PROFILE_SITE_LINKS) {
      expect(link.label.length).toBeGreaterThan(0);
      expect(link.description.length).toBeGreaterThan(0);
      expect(link.path.startsWith('/')).toBe(true);
    }
  });

  it('идентификаторы не повторяются — по ним строятся ключи списка', () => {
    const ids = PROFILE_SITE_LINKS.map((link) => link.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Прямая защита от дефекта 4 первого раунда: плашка перечисляла город и
   * контакты, но молчала про этап пути и духовную линию, и человек не
   * узнавал, что анкету знакомства можно пройти заново на сайте.
   */
  it('названы и поля профиля, и анкета знакомства', () => {
    const everything = PROFILE_SITE_LINKS.map((link) => `${link.label} ${link.description}`).join(' ').toLowerCase();
    for (const promised of ['город', 'языки', 'дата рождения', 'соцсети', 'мессенджеры', 'этап пути', 'духовная линия', 'знакомств']) {
      expect(everything).toContain(promised);
    }
  });

  it('ведёт на страницы сайта, которые действительно есть', () => {
    expect(PROFILE_SITE_LINKS.map((link) => link.path)).toEqual(['/profile', '/self-identification']);
  });
});

describe('profileSiteUrl', () => {
  it('собирает адрес по контуру сборки', () => {
    const [profile, self] = PROFILE_SITE_LINKS;
    expect(profileSiteUrl('https://vedamatch.ru', profile)).toBe('https://vedamatch.ru/profile');
    expect(profileSiteUrl('https://vedamatch.com', self)).toBe('https://vedamatch.com/self-identification');
  });

  it('не оставляет двойной косой на стыке', () => {
    expect(profileSiteUrl('https://vedamatch.ru/', PROFILE_SITE_LINKS[0])).toBe('https://vedamatch.ru/profile');
  });
});
