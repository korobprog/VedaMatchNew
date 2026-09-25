import type { ChatStatusMediaDto } from '@vedamatch/shared';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Ролик статуса на телефоне (VED-129): плеер `expo-video`, как `<video>` в
 * веб-версии (`status-video.web.tsx`). Время ролика ведёт полоску
 * прогресса, конец — переход к следующему статусу; таймер просмотра
 * (`runsOnTimer`) для видео не работает, поэтому зависнуть здесь нельзя:
 * если ролик не загрузился, показ тоже идёт дальше.
 *
 * Плеер создаётся заново на каждый статус — просмотр рисует компонент с
 * `key={status.id}`, и `useVideoPlayer` освобождает прежний сам.
 */
export const STATUS_VIDEO_INLINE = true;

/** Как часто плеер сообщает время: полоска двигается плавно, мост не забит. */
const TIME_UPDATE_INTERVAL_SEC = 0.25;

export interface StatusVideoProps {
  media: ChatStatusMediaDto;
  /** Что сказать скринридеру вместо картинки. */
  label: string;
  paused: boolean;
  /** Доля просмотренного, 0..1. */
  onProgress(share: number): void;
  onEnded(): void;
}

export function StatusVideo({ media, label, paused, onProgress, onEnded }: StatusVideoProps) {
  const player = useVideoPlayer(media.url, (created) => {
    created.loop = false;
    created.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SEC;
  });

  // Пауза — удержание пальцем в просмотре; снятие паузы и первый запуск —
  // здесь же, чтобы ролик не стартовал раньше, чем просмотр его покажет.
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (player.duration > 0) onProgress(Math.min(1, currentTime / player.duration));
  });
  useEventListener(player, 'playToEnd', onEnded);

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (status === 'error') onEnded();
    // onEnded меняется на каждой перерисовке просмотра; ошибка у плеера
    // одна, повторно шагать нельзя.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <View style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={label}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}
