import type { UnionPhoto as UnionPhotoDto } from '@vedamatch/shared';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import {
  AUTOPLAY_IDLE_MS,
  AUTOPLAY_STEP_MS,
  nextPhotoIndex,
  shouldAutoplay,
  tappedPhotoIndex,
} from '@/lib/union/union-gestures';
import { dark } from '@/theme/tokens';
import { UnionPhoto } from './union-photo';

/**
 * Фото анкеты во всю карточку: тап по правой половине — следующее, по левой —
 * предыдущее, сверху полоски «какое из скольких». Перенос варианта `cover`
 * из `recommendation-photo-carousel.tsx`.
 *
 * Смонтированы три снимка — предыдущий, текущий и следующий, — а видим
 * один: листание переключает видимость, а не заводит картинку заново, иначе
 * каждое листание стоило бы загрузки и декодирования и мигало бы (та же
 * причина, что на сайте). Окно из трёх, а не вся галерея, — чтобы память не
 * росла с числом снимков.
 *
 * Тап ловит обычный `Pressable`, а не жест поверх карточки: так свайп
 * карточки (жест-обработчик выше) отменяет нажатие сам, едва палец поехал, и
 * тап по кнопкам поверх фото до фото не доходит.
 */
export function PhotoCarousel({
  photos,
  avatarUrl,
  name,
  index,
  onIndexChange,
  paused = false,
  onTapPhoto,
}: {
  photos: UnionPhotoDto[];
  /** Без галереи — аватар портала; без него — первая буква имени. */
  avatarUrl: string | null;
  name: string;
  index: number;
  onIndexChange(index: number): void;
  /** Палец на карточке или раскрыта анкета — автолистание молчит. */
  paused?: boolean;
  /** Любое касание фото — чтобы погасить подсказку «тапните по краю». */
  onTapPhoto?(): void;
}) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const total = photos.length;
  const safeIndex = total === 0 ? 0 : Math.min(Math.max(0, index), total - 1);

  // Сколько раз листали сами: первый шаг ждёт дольше — человек ещё читает.
  // Листнул рукой — отсчёт заново.
  const [autoSteps, setAutoSteps] = useState(0);
  const notify = useRef(onIndexChange);
  notify.current = onIndexChange;

  const autoplay = shouldAutoplay(total, reduceMotion, paused);
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(
      () => {
        setAutoSteps((value) => value + 1);
        notify.current(nextPhotoIndex(safeIndex, total));
      },
      autoSteps === 0 ? AUTOPLAY_IDLE_MS : AUTOPLAY_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [autoplay, autoSteps, safeIndex, total]);

  if (total === 0) {
    return <UnionPhoto uri={avatarUrl} name={name} initialSize={96} />;
  }

  const mounted = [...new Set([(safeIndex - 1 + total) % total, safeIndex, (safeIndex + 1) % total])];
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      {mounted.map((photoIndex) => (
        <View
          key={photos[photoIndex].id}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: photoIndex === safeIndex ? 1 : 0 }]}
        >
          <UnionPhoto uri={photos[photoIndex].url} name={name} />
        </View>
      ))}

      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={`${name}, фото ${safeIndex + 1} из ${total}`}
        accessibilityHint={total > 1 ? 'Смахните вверх или вниз, чтобы листать фото' : undefined}
        accessibilityActions={
          total > 1
            ? [
                { name: 'increment', label: 'Следующее фото' },
                { name: 'decrement', label: 'Предыдущее фото' },
              ]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (total < 2) return;
          setAutoSteps(0);
          onIndexChange(
            event.nativeEvent.actionName === 'increment'
              ? (safeIndex + 1) % total
              : (safeIndex - 1 + total) % total,
          );
        }}
        onPress={(event) => {
          onTapPhoto?.();
          if (total < 2 || width <= 0) return;
          setAutoSteps(0);
          onIndexChange(
            tappedPhotoIndex({ currentIndex: safeIndex, total, tapX: event.nativeEvent.locationX, width }),
          );
        }}
        style={StyleSheet.absoluteFill}
      />

      {total > 1 ? (
        <View pointerEvents="none" style={styles.segments}>
          {photos.map((photo, photoIndex) => (
            <View
              key={photo.id}
              style={[
                styles.segment,
                { backgroundColor: dark.text0, opacity: photoIndex === safeIndex ? 1 : 0.4 },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
});
