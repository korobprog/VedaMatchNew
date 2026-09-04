import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Учёт границы российского контура: какие точки записи персональных данных
 * ходят через `PersonalDataService`.
 *
 * Приём тот же, что в `proxy.spec.ts` на вебе: список сверяется с диском.
 * Сканировать исходники регэкспом на «прямую запись» я пробовал — выходит либо
 * ложное срабатывание на упоминании поля в проекции DTO, либо пропуск
 * настоящей записи. Поэтому проверка точная: перечень против содержимого.
 *
 * Долгов сейчас нет — переведены все четыре точки. Появится новая точка записи
 * персональных данных — её место здесь, иначе данные россиянина уедут мимо
 * Москвы, и узнается об этом сильно позже.
 */
const WIRED = [
  'modules/auth/identity.service.ts',
  'modules/users/users.service.ts',
  'modules/users/user-gallery.service.ts',
  'modules/astro/astro-birth-data.service.ts',
  'modules/users/account-anonymize.service.ts',
];

/**
 * Точки, до которых очередь ещё не дошла. Пусто — и хорошо; строка тут это
 * долг с причиной, а не разрешение.
 */
const DEBT = new Map<string, string>();

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const USES_CONTOUR = /this\.personal\.(write|writeFor|sync|erase)\(/;

describe('граница российского контура', () => {
  it.each(WIRED)('%s пишет персональные данные через контур', (rel) => {
    expect(existsSync(join(root, rel))).toBe(true);
    expect(read(rel)).toMatch(USES_CONTOUR);
  });

  it('долги либо описаны, либо их нет', () => {
    for (const [file, reason] of DEBT) {
      expect(existsSync(join(root, file))).toBe(true);
      expect(reason.length).toBeGreaterThan(30);
      // Начал пользоваться контуром — строке место в WIRED, а не здесь.
      expect(read(file)).not.toMatch(USES_CONTOUR);
    }
    expect(DEBT.size).toBeLessThanOrEqual(0);
  });
});
