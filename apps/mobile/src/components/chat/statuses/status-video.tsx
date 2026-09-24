import type { ChatStatusMediaDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

/**
 * Ролик статуса на телефоне (VED-129).
 *
 * Своего видеоплеера в приложении нет: ни `expo-video`, ни `expo-av` не
 * подключены, а новый нативный модуль меняет APK и сборку в CI. Поэтому
 * здесь — обложка ролика, а смотреть его просмотр предлагает кнопкой
 * «Смотреть видео» (`status-viewer.tsx`): ролик открывается во встроенной
 * вкладке браузера по подписанной ссылке. Веб-версия (`status-video.web.tsx`)
 * играет ролик сама.
 *
 * Когда появится `expo-video`, этот файл заменяется плеером с теми же
 * пропсами, а `STATUS_VIDEO_INLINE` становится `true`.
 */
export const STATUS_VIDEO_INLINE = false;

export interface StatusVideoProps {
  media: ChatStatusMediaDto;
  /** Что сказать скринридеру вместо картинки. */
  label: string;
  paused: boolean;
  /** Доля просмотренного, 0..1. */
  onProgress(share: number): void;
  onEnded(): void;
}

export function StatusVideo({ media, label }: StatusVideoProps) {
  return (
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={label}>
      {media.posterUrl ? (
        <Image
          source={{ uri: media.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}
