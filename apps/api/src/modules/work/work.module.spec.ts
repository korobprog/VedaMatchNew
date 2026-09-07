import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Единственная точка касания портала — строка регистрации модуля в
 * `app.module.ts` (см. docs/service-module-contract.md). Её легче всего
 * потерять: импорт наверху файла остаётся, TypeScript молчит, сборка проходит,
 * и сервис не поднимает ни одного маршрута — ровно это и случилось при первой
 * выкатке «Работы».
 *
 * Проверка по исходнику, а не по метаданным Nest: импорт `AppModule` тянет за
 * собой весь портал вместе с ESM-зависимостями, которые jest не разбирает.
 * Тот же приём, что у `proxy.spec.ts`, сверяющего свой список с диском.
 */
describe('WorkModule в портале', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'app.module.ts'),
    'utf8',
  );

  /** Содержимое массива `imports: [...]` декоратора @Module. */
  const importsBlock = source.slice(
    source.indexOf('imports: ['),
    source.indexOf('providers: ['),
  );

  it('импортирован в app.module.ts', () => {
    expect(source).toContain(
      "import { WorkModule } from './modules/work/work.module';",
    );
  });

  it('зарегистрирован в imports, а не только импортирован', () => {
    expect(importsBlock).toContain('WorkModule,');
  });
});
