import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  findRouteShadows,
  formatShadow,
  parseControllerFile,
  parseModuleControllerOrder,
  type ControllerDeclaration,
  type RouteDeclaration,
} from './route-order';

/**
 * Обход всех контроллеров портала: ни один маршрут не должен быть закрыт
 * параметрическим, объявленным раньше. Дефект уже случался в чате — выход из
 * беседы уходил в удаление участника по имени «me».
 *
 * Разбор идёт по исходникам, а не по импорту `AppModule`: половина модулей
 * тянет ESM-зависимости (`jose`, `openid-client`), которые в jest требуют
 * моков, и список пришлось бы вести руками. Само правило «первый объявленный
 * побеждает» проверено настоящим запросом в `route-order.spec.ts`.
 */
const SRC = join(__dirname, '..');

function walk(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, suffix));
    else if (entry.name.endsWith(suffix)) found.push(full);
  }
  return found;
}

function collectRegistrationOrder(): RouteDeclaration[][] {
  const byName = new Map<string, ControllerDeclaration>();
  for (const file of walk(SRC, '.controller.ts'))
    for (const controller of parseControllerFile(readFileSync(file, 'utf8')))
      byName.set(controller.name, controller);

  const groups: RouteDeclaration[][] = [];
  const registered = new Set<string>();

  for (const file of walk(SRC, '.module.ts')) {
    const order = parseModuleControllerOrder(readFileSync(file, 'utf8'));
    const routes: RouteDeclaration[] = [];
    for (const name of order) {
      registered.add(name);
      const controller = byName.get(name);
      if (controller) routes.push(...controller.routes);
    }
    if (routes.length) groups.push(routes);
  }

  // Контроллер, не найденный ни в одном модуле, проверяется в одиночку:
  // внутри класса порядок значим в любом случае.
  for (const [name, controller] of byName)
    if (!registered.has(name) && controller.routes.length)
      groups.push(controller.routes);

  return groups;
}

describe('порядок маршрутов во всём API', () => {
  const groups = collectRegistrationOrder();

  it('контроллеры вообще разобрались', () => {
    const total = groups.reduce((sum, group) => sum + group.length, 0);
    expect(groups.length).toBeGreaterThan(20);
    expect(total).toBeGreaterThan(200);
  });

  it('ни один маршрут не закрыт параметрическим, объявленным раньше', () => {
    const shadows = groups.flatMap((group) => findRouteShadows(group));
    expect(shadows.map(formatShadow)).toEqual([]);
  });
});
