import type {
  InstallEnvironmentReport,
  PwaBrowserFamily,
  PwaDisplayMode,
  PwaPlatform,
} from '@vedamatch/shared';

const browsers: readonly PwaBrowserFamily[] = [
  'chrome',
  'samsung',
  'yandex-browser',
  'yandex-app',
  'safari',
  'firefox',
  'edge',
  'opera',
  'other',
];
const platforms: readonly PwaPlatform[] = ['android', 'ios', 'desktop'];
const displayModes: readonly PwaDisplayMode[] = [
  'fullscreen',
  'standalone',
  'minimal-ui',
  'browser',
];

/**
 * Замер приходит из браузера, то есть от кого угодно. В базу попадают только
 * значения из списков выше: чужая строка не должна ни ронять запись, ни
 * размывать срез мусорной категорией.
 */
export function parseInstallEnvironmentReport(
  body: unknown,
): InstallEnvironmentReport | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as Record<string, unknown>;

  const browser = raw.browser as PwaBrowserFamily;
  const platform = raw.platform as PwaPlatform;
  const displayMode = raw.displayMode as PwaDisplayMode;
  if (!browsers.includes(browser)) return null;
  if (!platforms.includes(platform)) return null;
  if (!displayModes.includes(displayMode)) return null;
  if (typeof raw.standaloneCapable !== 'boolean') return null;

  return {
    browser,
    platform,
    displayMode,
    standaloneCapable: raw.standaloneCapable,
  };
}

/**
 * Prisma не разрешает дефис в имени члена enum, а наружу значения уходят с
 * дефисом ('yandex-browser', 'minimal-ui'). Дефис в них ровно один, поэтому
 * перевод в обе стороны — одна замена.
 */
export function toDbValue(value: string): string {
  return value.replace('-', '_');
}

export function fromDbValue(value: string): string {
  return value.replace('_', '-');
}
