// Показ экрана в групповом звонке (VED-360): русские подписи уведомления
// «Идёт показ экрана».
//
// Уведомление рисует служба react-native-webrtc (`MediaProjectionService`,
// поправлена заплаткой `patches/react-native-webrtc@124.0.8.patch`), а её
// строки — английские ресурсы библиотеки. Строка с тем же именем в
// ресурсах ПРИЛОЖЕНИЯ перекрывает библиотечную при слиянии ресурсов —
// правка Java ради перевода не нужна.
//
// Чистая часть — здесь и покрыта node:test (`screen-share-strings.test.mjs`);
// обвязка `withStringsXml` — в `with-screen-share.js`.

/** Имя ресурса → русский текст. Имена — из `res/values/strings.xml` библиотеки. */
const SCREEN_SHARE_STRINGS = Object.freeze({
  ongoing_notification_channel_name: 'Показ экрана',
  media_projection_notification_title: 'Вы показываете экран',
  media_projection_notification_text:
    'Участники звонка видят ваш экран. Нажмите, чтобы вернуться к звонку',
  media_projection_notification_stop: 'Остановить показ',
});

/**
 * Вписать строки в разобранный `strings.xml` (форма `xml2js`, как её отдаёт
 * `withStringsXml`). Существующая строка с тем же именем заменяется на
 * месте, остальные не трогаются; новые добавляются в конец.
 */
function applyScreenShareStrings(xml, strings = SCREEN_SHARE_STRINGS) {
  const resources = xml && typeof xml.resources === 'object' && xml.resources
    ? xml.resources
    : {};
  const items = Array.isArray(resources.string) ? [...resources.string] : [];
  for (const [name, value] of Object.entries(strings)) {
    const item = { $: { name }, _: value };
    const index = items.findIndex((entry) => entry && entry.$ && entry.$.name === name);
    if (index >= 0) items[index] = item;
    else items.push(item);
  }
  return { ...xml, resources: { ...resources, string: items } };
}

module.exports = { SCREEN_SHARE_STRINGS, applyScreenShareStrings };
