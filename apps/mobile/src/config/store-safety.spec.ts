import { findDirectChannelChecks } from './channel-guard';
import {
  STORE_FORBIDDEN_PATTERNS,
  describeFindings,
  findForbiddenPermissions,
  findForbiddenText,
} from './store-safety';

describe('findForbiddenPermissions', () => {
  it('находит разрешение установки пакетов', () => {
    expect(
      findForbiddenPermissions([
        'android.permission.CAMERA',
        'android.permission.REQUEST_INSTALL_PACKAGES',
      ]),
    ).toEqual(['android.permission.REQUEST_INSTALL_PACKAGES']);
  });

  it('обычный набор разрешений звонков проходит', () => {
    expect(
      findForbiddenPermissions(['android.permission.MANAGE_OWN_CALLS', 'android.permission.RECORD_AUDIO']),
    ).toEqual([]);
  });

  it('пустой список разрешений — пустой результат', () => {
    expect(findForbiddenPermissions([])).toEqual([]);
  });
});

describe('findForbiddenText', () => {
  it.each([
    ['цена в рублях', 'const label = `${price} ₽ в месяц`;'],
    ['цена в криптовалюте', "const alt = 'или 2 USDT';"],
    ['тариф', "title: 'Тарифы и оплата'"],
    ['призыв оплатить', "<Text>Оформить подписку</Text>"],
    ['ссылка на платный раздел сайта', "serviceUrl(webOrigin, '/billing')"],
    ['предложение скачать APK', "'Скачайте полную версию приложения'"],
    ['установка пакетов', "IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE')"],
    ['манифест самообновления', "const url = `${base}/mobile/android/ru-site/latest.json`;"],
  ])('ловит «%s»', (id, source) => {
    const findings = findForbiddenText('файл.ts', source);
    expect(findings.map((f) => f.id)).toContain(id);
  });

  it('называет файл, возможность и кусок строки — чтобы не искать вручную', () => {
    const [finding] = findForbiddenText('src/app/(tabs)/services.tsx', 'const price = "108 ₽";');
    expect(finding.file).toBe('src/app/(tabs)/services.tsx');
    expect(finding.capability).toBe('inAppPayments');
    expect(finding.sample).toContain('₽');
    expect(finding.why.length).toBeGreaterThan(0);
  });

  // Правила обязаны быть узкими: «подписка» в переписке — это подписка на
  // канал общины, и по ней бить нельзя (иначе проверку отключат целиком).
  it.each([
    'Подписаться на канал общины',
    'const subscription = AppState.addEventListener("change", onChange);',
    'Открыть на сайте',
    'Оптимизировать загрузку',
    'const tonality = 1;',
  ])('не срабатывает на невиновном коде: %s', (source) => {
    expect(findForbiddenText('файл.ts', source)).toEqual([]);
  });

  it('одно правило — не больше одной находки на файл', () => {
    const findings = findForbiddenText('файл.ts', '108 ₽\n216 ₽\n324 ₽');
    expect(findings.filter((f) => f.id === 'цена в рублях')).toHaveLength(1);
  });

  it('ни одно правило не имеет флага g — иначе они молча пропускают файлы через один', () => {
    for (const rule of STORE_FORBIDDEN_PATTERNS) expect(rule.pattern.global).toBe(false);
  });

  it('описание находок печатает файл и правило', () => {
    const text = describeFindings(findForbiddenText('a.ts', 'цена 108 ₽'));
    expect(text).toContain('a.ts');
    expect(text).toContain('цена в рублях');
  });

  it('пустой текст находок не даёт', () => {
    expect(findForbiddenText('файл.ts', '')).toEqual([]);
  });
});

describe('findDirectChannelChecks', () => {
  it('ловит ветвление по каналу мимо таблицы возможностей', () => {
    const violations = findDirectChannelChecks([
      { path: 'src/app/screen.tsx', source: "if (variant.channel === 'site') show();" },
    ]);
    expect(violations).toEqual([
      { file: 'src/app/screen.tsx', line: 1, text: "if (variant.channel === 'site') show();" },
    ]);
  });

  it('ловит и обратный порядок сравнения, и !==', () => {
    expect(
      findDirectChannelChecks([
        { path: 'a.ts', source: "const x = 'store' !== channel;" },
        { path: 'b.ts', source: "if (appVariant().channel !== 'store') {}" },
      ]).map((v) => v.file),
    ).toEqual(['a.ts', 'b.ts']);
  });

  it('чтение канала как данных не запрещено — из него склеивается адрес манифеста', () => {
    expect(
      findDirectChannelChecks([
        { path: 'src/lib/self-update/self-update-client.ts', source: 'return `${base}/${variant.contour}-${variant.channel}/`;' },
      ]),
    ).toEqual([]);
  });

  it('таблица возможностей — единственное место, где сравнение разрешено', () => {
    const source = "const row = channel === 'store' ? a : b;";
    expect(findDirectChannelChecks([{ path: 'src/config/capabilities.ts', source }])).toEqual([]);
    expect(findDirectChannelChecks([{ path: 'src/config/другое.ts', source }])).toHaveLength(1);
  });

  it('номер строки указывает на настоящую строку', () => {
    const source = ['// комментарий', '', "if (channel === 'site') {}"].join('\n');
    expect(findDirectChannelChecks([{ path: 'a.ts', source }])[0].line).toBe(3);
  });
});
