import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Учёт границы российского контура: какие точки записи персональных данных
 * переведены на `PersonalDataService`, а какие ещё нет.
 *
 * Приём тот же, что в `proxy.spec.ts` на вебе: список сверяется с диском.
 * Сканировать исходники регэкспом на «прямую запись» я пробовал — выходит либо
 * ложное срабатывание на упоминании поля в проекции DTO, либо пропуск
 * настоящей записи. Поэтому проверка точная: перечень против содержимого.
 *
 * **Список долгов должен сокращаться.** Перевели точку — строка переезжает из
 * `DEBT` в `WIRED`, и тест об этом напомнит сам.
 */
const WIRED = [
  'modules/auth/identity.service.ts',
  'modules/users/users.service.ts',
];

const DEBT = new Map<string, string>([
  [
    'modules/users/user-gallery.service.ts',
    'Ключи фотографий. Порядок «Москва первой» упирается в проверку квоты внутри транзакции: запись до неё оставила бы в Москве ключ отвергнутого фото.',
  ],
  [
    'modules/astro/astro-birth-data.service.ts',
    'Данные рождения. Точка одна, upsert, перевод прямолинейный.',
  ],
  [
    'modules/users/account-anonymize.service.ts',
    'Удаление аккаунта не стирает московскую запись. Право на удаление обязано доходить до контура.',
  ],
]);

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('граница российского контура', () => {
  it.each(WIRED)('%s пишет персональные данные через контур', (rel) => {
    expect(existsSync(join(root, rel))).toBe(true);
    expect(read(rel)).toContain('personal.write(');
  });

  it.each([...DEBT.keys()])('%s ещё не переведён — это известный долг', (rel) => {
    expect(existsSync(join(root, rel))).toBe(true);
    // Как только файл начнёт пользоваться контуром, тест упадёт и попросит
    // перенести строку в WIRED. Иначе долг тихо остаётся в списке навсегда.
    expect(read(rel)).not.toContain('PersonalDataService');
  });

  it('у каждого долга записана причина', () => {
    for (const [file, reason] of DEBT) {
      expect(file).toMatch(/\.ts$/);
      expect(reason.length).toBeGreaterThan(30);
    }
  });
});
