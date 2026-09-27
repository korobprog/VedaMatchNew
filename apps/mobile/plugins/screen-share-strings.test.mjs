import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  SCREEN_SHARE_STRINGS,
  applyScreenShareStrings,
} = require('./screen-share-strings.js');

const byName = (xml) =>
  Object.fromEntries(xml.resources.string.map((item) => [item.$.name, item._]));

test('пустой strings.xml получает все строки уведомления', () => {
  const out = applyScreenShareStrings({ resources: {} });
  assert.deepEqual(byName(out), { ...SCREEN_SHARE_STRINGS });
});

test('чужие строки остаются, одноимённая заменяется на месте', () => {
  const input = {
    resources: {
      string: [
        { $: { name: 'app_name' }, _: 'VedaMatch' },
        { $: { name: 'media_projection_notification_stop' }, _: 'Stop sharing' },
      ],
    },
  };
  const out = applyScreenShareStrings(input);
  assert.equal(out.resources.string[0]._, 'VedaMatch');
  assert.equal(out.resources.string[1]._, 'Остановить показ');
  assert.equal(
    out.resources.string.filter((s) => s.$.name === 'media_projection_notification_stop').length,
    1,
  );
  // Вход не портится: плагин могут позвать повторно.
  assert.equal(input.resources.string[1]._, 'Stop sharing');
});

test('каждое имя есть в ресурсах библиотеки — иначе перевод ничего не перекроет', () => {
  // Заплатка добавляет media_projection_notification_stop; остальные
  // имена — родные строки react-native-webrtc.
  const patch = readFileSync(
    new URL('../../../patches/react-native-webrtc@124.0.8.patch', import.meta.url),
    'utf8',
  );
  const library = [
    'ongoing_notification_channel_name',
    'media_projection_notification_title',
    'media_projection_notification_text',
  ];
  for (const name of Object.keys(SCREEN_SHARE_STRINGS)) {
    assert.ok(
      library.includes(name) || patch.includes(`name="${name}"`),
      `нет строки ${name} ни в библиотеке, ни в заплатке`,
    );
  }
});
