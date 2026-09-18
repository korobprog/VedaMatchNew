// Входы воркфлоу Mobile APK → versionCode и адрес раздачи самообновления
// (VED-176, итерация 3). Чистые функции + CLI для шага «Version code»:
//
//   node scripts/release-version.mjs   # читает env, печатает строки KEY=VALUE для $GITHUB_ENV
//
// Тест: node --test apps/mobile/scripts/release-version.test.mjs

/** Боевая база: versionCode = 1000 + номер запуска (app-version.ts). */
export const PRODUCTION_VERSION_CODE_BASE = 1000;
/** Потолок versionCode в Google Play/Android. */
export const MAX_VERSION_CODE = 2_100_000_000;

/**
 * База versionCode из входа `version_code_base`. Только десятичное число без
 * ведущего нуля: bash прочитал бы `0100` как восьмеричное, а на `08` упал бы
 * (раунд 002, замечание 5). Большая база без тестовой папки при публикации
 * запрещена: весь сайт уехал бы на 2000+ без пути назад (замечание 4).
 */
export function resolveVersionCode({ base, runNumber, publish, testFolder }) {
  const rawBase = String(base ?? '').trim() || String(PRODUCTION_VERSION_CODE_BASE);
  if (!/^[1-9][0-9]*$/.test(rawBase)) {
    throw new Error(`version_code_base="${rawBase}": нужно целое десятичное число без ведущих нулей`);
  }
  const baseNumber = Number(rawBase);
  const run = Number(String(runNumber ?? '').trim());
  if (!Number.isSafeInteger(run) || run <= 0) {
    throw new Error(`GITHUB_RUN_NUMBER="${runNumber}": ожидалось положительное целое`);
  }
  if (publish && !testFolder && baseNumber !== PRODUCTION_VERSION_CODE_BASE) {
    throw new Error(
      `version_code_base=${baseNumber} с publish=true без test_folder=true запрещена: ` +
        `боевой сайт уехал бы на versionCode ${baseNumber + run} без пути назад. ` +
        `Для проверки включите test_folder, для боевой публикации оставьте базу ${PRODUCTION_VERSION_CODE_BASE}.`,
    );
  }
  const versionCode = baseNumber + run;
  if (versionCode > MAX_VERSION_CODE) {
    throw new Error(`versionCode ${versionCode} больше предела Android ${MAX_VERSION_CODE}`);
  }
  return versionCode;
}

/**
 * Адрес раздачи для клиента: только канал site; хвостовой `/` секрета
 * срезается до склейки с `/test`, иначе выйдет `…//test/mobile/…`.
 */
export function resolveDownloadBaseUrl({ channel, s3PublicUrl, testFolder }) {
  if (channel !== 'site') return '';
  const base = String(s3PublicUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return testFolder ? `${base}/test` : base;
}

const truthy = (value) => String(value ?? '').trim() === 'true';

function main() {
  const env = process.env;
  const versionCode = resolveVersionCode({
    base: env.VERSION_CODE_BASE,
    runNumber: env.GITHUB_RUN_NUMBER,
    publish: truthy(env.INPUT_PUBLISH),
    testFolder: truthy(env.INPUT_TEST_FOLDER),
  });
  const downloadBaseUrl = resolveDownloadBaseUrl({
    channel: env.APP_CHANNEL,
    s3PublicUrl: env.S3_PUBLIC_URL,
    testFolder: truthy(env.INPUT_TEST_FOLDER),
  });
  process.stdout.write(`APP_VERSION_CODE=${versionCode}\nAPP_DOWNLOAD_BASE_URL=${downloadBaseUrl}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
