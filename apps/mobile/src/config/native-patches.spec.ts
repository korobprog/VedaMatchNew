import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Заплатки нативных пакетов (VED-331) обязаны реально попадать в сборку.
 *
 * Пакеты Expo SDK 57 везут с собой готовый AAR (`local-maven-repo`), и
 * Gradle по умолчанию берёт его, а не исходники: заплатка
 * `patches/expo-audio@57.0.5.patch` правила Kotlin, а в APK уезжал
 * нетронутый класс — на телефоне это выглядело бы как «пауза при отключении
 * наушников не работает». Поймано разбором dex первой сборки 5025.
 * Лечение — `expo.autolinking.android.buildFromSource` в `package.json`;
 * этот тест не даёт завести заплатку на пакет Expo, забыв про сборку из
 * исходников.
 */
const ROOT = path.resolve(__dirname, '../../../..');

function patchedPackages(): string[] {
  const workspace = readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = workspace.split(/^patchedDependencies:\s*$/m)[1] ?? '';
  return [...block.matchAll(/^\s+'?(@?[^@'\s]+)@[^:]+:/gm)].map((match) => match[1]);
}

describe('заплатки нативных пакетов', () => {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    expo?: { autolinking?: { android?: { buildFromSource?: string[] } } };
  };
  const fromSource = pkg.expo?.autolinking?.android?.buildFromSource ?? [];

  it('заплатка expo-audio зарегистрирована', () => {
    expect(patchedPackages()).toContain('expo-audio');
  });

  it('каждый пропатченный пакет Expo собирается из исходников, а не из готового AAR', () => {
    const expoPatched = patchedPackages().filter((name) => name.startsWith('expo-') && name in pkg.dependencies);
    expect(expoPatched.length).toBeGreaterThan(0);
    for (const name of expoPatched) expect(fromSource).toContain(name);
  });
});
