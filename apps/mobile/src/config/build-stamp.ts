import Constants from 'expo-constants';

/**
 * Отметка сборки: когда собран этот бандл и из какого коммита.
 *
 * Нужна, чтобы отличать «страница не обновилась» от «обновилась, но
 * выглядит иначе»: в мини-приложении Telegram и в установленном на экран
 * «Домой» PWA страница может открыться из кэша, и понять это со стороны
 * сервера нельзя — метку видно прямо на экране входа.
 */
export interface BuildStamp {
  /** ISO-время сборки, минуты: `2026-09-18T03:45`. */
  builtAt: string | null;
  /** Короткий sha коммита, если сборка шла из CI. */
  commit: string | null;
}

export function buildStamp(): BuildStamp {
  const build = (Constants.expoConfig?.extra as { build?: Record<string, unknown> } | undefined)?.build;
  // Только строки: Expo сериализует `null` в `{}`, и без проверки в метку
  // попадал бы «[object Object]».
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return { builtAt: text(build?.builtAt), commit: text(build?.commit) };
}

/** Человеку: «сборка 18.09 03:45 · a1b2c3d». Пусто — если метки нет. */
export function buildStampLabel(stamp: BuildStamp, now = new Date()): string {
  if (!stamp.builtAt) return '';
  const parsed = new Date(stamp.builtAt);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() > now.getTime() + 86_400_000) return '';
  const two = (value: number) => String(value).padStart(2, '0');
  const date = `${two(parsed.getDate())}.${two(parsed.getMonth() + 1)} ${two(parsed.getHours())}:${two(parsed.getMinutes())}`;
  return stamp.commit ? `сборка ${date} · ${stamp.commit}` : `сборка ${date}`;
}
