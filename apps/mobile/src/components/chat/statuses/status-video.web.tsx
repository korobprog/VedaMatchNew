import { useEffect, useRef } from 'react';
import type { StatusVideoProps } from './status-video';

/**
 * Ролик статуса в веб-версии (ios.vedamatch.com): обычный `<video>`
 * браузера, как на сайте (`apps/web/.../status-viewer.tsx`). Время и конец
 * ролика ведут полоску прогресса и переход к следующему статусу.
 */
export const STATUS_VIDEO_INLINE = true;

export function StatusVideo({ media, label, paused, onProgress, onEnded }: StatusVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (paused) video.pause();
    // Автозапуск со звуком браузер может запретить — тогда ролик ждёт
    // касания, а полоска стоит; ошибку глотать, а не ронять просмотр.
    else void video.play().catch(() => undefined);
  }, [paused]);

  return (
    <video
      ref={ref}
      key={media.url}
      src={media.url}
      poster={media.posterUrl ?? undefined}
      aria-label={label}
      autoPlay
      playsInline
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (video.duration > 0) onProgress(video.currentTime / video.duration);
      }}
      onEnded={onEnded}
    />
  );
}
