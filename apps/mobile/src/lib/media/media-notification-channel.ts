import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PLAYBACK_CHANNEL_ID, PLAYBACK_CHANNEL_NAME } from './media-session';

/**
 * Канал уведомления «Сейчас играет» (VED-331).
 *
 * Службу переднего плана поднимает `expo-audio` (`AudioControlsService`) и
 * канал заводит сам — но с именем, равным id: в настройках уведомлений
 * человек увидел бы строку «expo_audio_channel». Служба создаёт канал,
 * только если его ещё нет, поэтому заводим его раньше, со своим именем.
 *
 * Важность низкая: без звука и вибрации, карточка тихо лежит в шторке и на
 * экране блокировки. Разрешение на уведомления (Android 13+) для неё не
 * нужно: уведомления медиасеанса система показывает и без него.
 */
let created: Promise<void> | null = null;

export function ensurePlaybackChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!created) {
    created = Notifications.setNotificationChannelAsync(PLAYBACK_CHANNEL_ID, {
      name: PLAYBACK_CHANNEL_NAME,
      description: 'Что играет в Медиатеке: пауза и перемотка из шторки и с экрана блокировки.',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      vibrationPattern: null,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
      .then(() => undefined)
      .catch(() => {
        // Не вышло — служба заведёт канал сама, с техническим именем.
        created = null;
      });
  }
  return created;
}
