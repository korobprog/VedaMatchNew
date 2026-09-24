#!/usr/bin/env node
// Манифест самообновления APK, раздаваемого с сайта (VED-176, channel=site).
//
// Чистая часть (ключи объектов S3, сборка и проверка манифеста) тестируется
// напрямую движком Node, без сборки и без сети:
//
//   node --test apps/mobile/scripts/app-manifest.test.mjs
//
// CLI-обвязка ниже читает APK с диска, считает его размер и SHA-256 и
// пишет готовый `latest.json` — воркфлоу `.github/workflows/mobile-apk.yml`
// потом кладёт файл рядом с APK в S3-хранилище портала.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Версия Android, ниже которой приложение уже не ставится (см. README). */
export const DEFAULT_MIN_ANDROID = '7.0';

/** Заметка «что нового» длиннее этого — ошибка ввода, а не заметка. */
export const MAX_NOTES_LENGTH = 1000;

/**
 * Заметка к выпуску из входа воркфлоу `release_notes`. Поле ввода GitHub
 * однострочное, поэтому `\n` в тексте — перенос строки. Пусто — заметки нет,
 * и поле в манифест не пишется: сервер тогда пишет в канал общую строку.
 */
export function normalizeReleaseNotes(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
  if (!text) return null;
  if (text.length > MAX_NOTES_LENGTH) {
    throw new Error(`Заметка к выпуску длиннее ${MAX_NOTES_LENGTH} символов`);
  }
  return text;
}

/** Общий префикс объектов раздачи одного контура и канала. */
export function objectKeyPrefix(contour, channel) {
  return `mobile/android/${contour}-${channel}`;
}

/** Ключ самого APK — имя несёт версию, чтобы старые сборки не перетирались. */
export function apkObjectKey(contour, channel, versionName, versionCode) {
  return `${objectKeyPrefix(contour, channel)}/vedamatch-${versionName}-${versionCode}.apk`;
}

/** Ключ манифеста — всегда один и тот же файл, его перезаписывает каждая публикация. */
export function manifestObjectKey(contour, channel) {
  return `${objectKeyPrefix(contour, channel)}/latest.json`;
}

/**
 * Собирает и проверяет объект манифеста. Бросает исключение на первом же
 * недостающем или некорректном поле — CI обязан упасть на плохом манифесте,
 * а не молча выложить его в S3 поверх рабочего.
 */
export function buildAppManifest({
  versionName,
  versionCode,
  sizeBytes,
  sha256,
  url,
  commit,
  builtAt,
  minAndroid = DEFAULT_MIN_ANDROID,
  notes,
}) {
  if (!versionName || typeof versionName !== 'string') {
    throw new Error('versionName обязателен и должен быть строкой');
  }
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error('versionCode должен быть положительным целым числом');
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error('sizeBytes должен быть положительным целым числом');
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('sha256 должен быть hex-строкой из 64 символов');
  }
  if (!url || typeof url !== 'string') {
    throw new Error('url обязателен и должен быть строкой');
  }
  if (!commit || typeof commit !== 'string') {
    throw new Error('commit обязателен и должен быть строкой');
  }
  if (!builtAt || Number.isNaN(Date.parse(builtAt))) {
    throw new Error('builtAt обязателен и должен быть датой ISO-8601');
  }

  const releaseNotes = normalizeReleaseNotes(notes);
  return {
    versionName,
    versionCode,
    sizeBytes,
    sha256,
    url,
    commit,
    builtAt,
    minAndroid,
    // «Что нового» для поста в официальном канале. Необязательное поле:
    // разборщики приложения и сайта лишние поля пропускают.
    ...(releaseNotes ? { notes: releaseNotes } : {}),
  };
}

/** SHA-256 файла потоком: APK может весить десятки мегабайт. */
function sha256OfFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const value = argv[i + 1];
    args[name] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['apk', 'version-name', 'version-code', 'url', 'commit', 'out'];
  const missing = required.filter((name) => !args[name]);
  if (missing.length > 0) {
    console.error(`Не хватает аргументов: ${missing.map((n) => `--${n}`).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const apkStat = await stat(args.apk);
  const sha256 = await sha256OfFile(args.apk);

  const manifest = buildAppManifest({
    versionName: args['version-name'],
    versionCode: Number(args['version-code']),
    sizeBytes: apkStat.size,
    sha256,
    url: args.url,
    commit: args.commit,
    builtAt: new Date().toISOString(),
    minAndroid: args['min-android'] ?? DEFAULT_MIN_ANDROID,
    notes: args.notes,
  });

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Манифест записан: ${args.out}`);
  console.log(JSON.stringify(manifest, null, 2));
}

// Запуск только как CLI, не при импорте из теста.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
