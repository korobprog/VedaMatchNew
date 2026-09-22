import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';
import appConfig from '../../app.config';
import { findDirectChannelChecks, type SourceFile } from './channel-guard';
import { walkModuleGraph, type ModuleGraphDeps } from './module-graph';
import { describeFindings, findForbiddenPermissions, findForbiddenText } from './store-safety';

/**
 * Проверки сборки витрины на настоящем дереве репозитория (VED-207).
 *
 * Чистая логика живёт отдельно (`store-safety.ts`, `channel-guard.ts`,
 * `module-graph.ts`) и покрыта своими тестами; здесь она натравливается на
 * `apps/mobile` целиком — так правило ловит не выдуманный, а завтрашний
 * реальный код.
 *
 * Границы: настоящего бандла Metro мы не собираем (минуты и сотни мегабайт
 * в юнит-тесте), вместо него — обход импортов с той же подменой модулей, что
 * делает резолвер (`channel-shims/resolve.cjs`). Смысл текстов, посты бота и
 * данные, приходящие с сервера, машиной не проверяются — это VED-216.
 */

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const { STORE_SHIMS } = require('../../channel-shims/resolve.cjs') as {
  STORE_SHIMS: Record<string, string>;
};

/** Порядок как у Metro для Android: платформенный файл важнее общего. */
const EXTENSIONS = ['.android.tsx', '.android.ts', '.tsx', '.ts', '.jsx', '.js'];

function relative(absolute: string): string {
  return path.relative(MOBILE_ROOT, absolute).split(path.sep).join('/');
}

function existingFile(candidate: string): string | null {
  for (const extension of ['', ...EXTENSIONS, ...EXTENSIONS.map((e) => `/index${e}`)]) {
    const file = candidate + extension;
    if (extension !== '' && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

/** Резолв спецификатора так же, как его видит Metro при сборке канала. */
function resolveForChannel(fromFile: string, specifier: string, shims: Record<string, string>): string | null {
  const shim = shims[specifier];
  if (shim) return path.join(MOBILE_ROOT, 'channel-shims', shim);
  // Ассеты в граф кода не входят: картинки строк не содержат.
  if (specifier.startsWith('@/assets/')) return null;
  if (specifier.startsWith('@/')) return existingFile(path.join(MOBILE_ROOT, 'src', specifier.slice(2)));
  if (specifier.startsWith('.')) {
    return existingFile(path.resolve(path.dirname(path.join(MOBILE_ROOT, fromFile)), specifier));
  }
  // Пакет из node_modules: его содержимое — не наш код и не наш текст.
  return null;
}

function graphDeps(shims: Record<string, string>): ModuleGraphDeps {
  return {
    readSource: (file) => {
      const absolute = path.join(MOBILE_ROOT, file);
      return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
    },
    resolve: (fromFile, specifier) => {
      const resolved = resolveForChannel(fromFile, specifier, shims);
      return resolved ? relative(resolved) : null;
    },
  };
}

function filesUnder(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out.sort();
}

/**
 * Точки входа: `index.js` (регистрация headless-задач) и всё дерево маршрутов
 * `src/app` — его подхватывает файловая маршрутизация expo-router, а не
 * импорт из кода. Веб-варианты (`*.web.tsx`) в сборку Android не идут.
 */
const ENTRIES = [
  'index.js',
  ...filesUnder(path.join(MOBILE_ROOT, 'src/app'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.web\.tsx?$/.test(f) && !/\.spec\.tsx?$/.test(f))
    .map(relative),
];

const STORE_GRAPH = walkModuleGraph(ENTRIES, graphDeps(STORE_SHIMS));
const SITE_GRAPH = walkModuleGraph(ENTRIES, graphDeps({}));

describe('граф модулей сборки витрины', () => {
  it('точки входа найдены — проверка не пустая', () => {
    expect(ENTRIES).toContain('index.js');
    expect(ENTRIES).toContain('src/app/(tabs)/services.tsx');
    expect(STORE_GRAPH.length).toBeGreaterThan(50);
  });

  // Если бы подмены не было, эти модули лежали бы в APK витрины вместе с
  // адресом раздачи и установщиком — снимите подмену, и тест покраснеет.
  it('код самообновления в граф витрины не входит, а в граф сайта входит', () => {
    const selfUpdate = (files: string[]) => files.filter((f) => f.startsWith('src/lib/self-update/'));
    expect(selfUpdate(STORE_GRAPH)).toEqual([]);
    expect(STORE_GRAPH).not.toContain('src/components/self-update/self-update-section.tsx');
    expect(selfUpdate(SITE_GRAPH).length).toBeGreaterThan(0);
    expect(SITE_GRAPH).toContain('src/components/self-update/self-update-section.tsx');
  });

  it('заглушка канала в графе витрины есть — подмена сработала, а не сломала импорт', () => {
    expect(STORE_GRAPH).toContain('channel-shims/self-update-section.tsx');
    expect(SITE_GRAPH).not.toContain('channel-shims/self-update-section.tsx');
  });

  it('в достижимом коде витрины нет ни цен, ни призывов оплатить, ни установки APK', () => {
    const findings = STORE_GRAPH.flatMap((file) =>
      findForbiddenText(file, readFileSync(path.join(MOBILE_ROOT, file), 'utf8')),
    );
    expect(describeFindings(findings)).toBe('');
    expect(findings).toEqual([]);
  });
});

describe('слой возможностей', () => {
  /** Весь свой код: тесты не в счёт — они обязаны проверять оба канала. */
  const SOURCES: SourceFile[] = [
    ...filesUnder(path.join(MOBILE_ROOT, 'src')),
    path.join(MOBILE_ROOT, 'app.config.ts'),
    path.join(MOBILE_ROOT, 'metro.config.js'),
    ...filesUnder(path.join(MOBILE_ROOT, 'channel-shims')),
  ]
    .filter((f) => /\.(ts|tsx|js|cjs|mjs)$/.test(f) && !/\.(spec|test)\.(ts|tsx|mjs)$/.test(f))
    .map((f) => ({ path: relative(f), source: readFileSync(f, 'utf8') }));

  it('файлы для проверки собраны', () => {
    expect(SOURCES.map((f) => f.path)).toContain('src/config/capabilities.ts');
    expect(SOURCES.length).toBeGreaterThan(100);
  });

  it('решение «что можно каналу» принимается только в таблице возможностей', () => {
    const violations = findDirectChannelChecks(SOURCES);
    expect(
      violations.map((v) => `${v.file}:${v.line} — ${v.text}`).join('\n'),
    ).toBe('');
  });
});

describe('манифест Android по каналам', () => {
  const previousChannel = process.env.APP_CHANNEL;

  function configFor(channel: string): ExpoConfig {
    process.env.APP_CHANNEL = channel;
    return appConfig({ config: {} } as never);
  }

  afterEach(() => {
    if (previousChannel === undefined) delete process.env.APP_CHANNEL;
    else process.env.APP_CHANNEL = previousChannel;
  });

  it('витрина не просит разрешений из запретного списка', () => {
    expect(findForbiddenPermissions(configFor('store').android?.permissions ?? [])).toEqual([]);
  });

  it('сборка с сайта их просит — проверка различает каналы, а не молчит всегда', () => {
    expect(findForbiddenPermissions(configFor('site').android?.permissions ?? [])).toEqual([
      'android.permission.REQUEST_INSTALL_PACKAGES',
    ]);
  });

  it('разрешения каналов различаются ровно установкой пакетов', () => {
    const store = configFor('store').android?.permissions ?? [];
    const site = configFor('site').android?.permissions ?? [];
    expect(site.filter((p) => !store.includes(p))).toEqual(['android.permission.REQUEST_INSTALL_PACKAGES']);
    expect(store.filter((p) => !site.includes(p))).toEqual([]);
  });

  it('набор плагинов у каналов одинаковый — нативных модулей «только для сайта» пока нет', () => {
    const names = (config: ExpoConfig) =>
      (config.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    expect(names(configFor('store'))).toEqual(names(configFor('site')));
  });
});
