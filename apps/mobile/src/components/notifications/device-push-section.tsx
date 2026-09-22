/**
 * Раздел «Уведомления на этом устройстве» — только для веб-сборки
 * (`ios.vedamatch.com`, VED-313). Настоящая реализация лежит рядом в
 * `device-push-section.web.tsx`, Metro подставляет её при `platform === 'web'`.
 *
 * В нативной сборке (Android из RuStore/с сайта, iOS из App Store) уведомления
 * идут через Firebase и включаются системным запросом при первом входе
 * (`src/lib/push/push-bridge.tsx`) — отдельного переключателя там нет и не
 * должно быть, поэтому здесь пусто. Тот же приём, что у `push-bridge.web.tsx`.
 */
export function DevicePushSection() {
  return null;
}
