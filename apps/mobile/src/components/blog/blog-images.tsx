import type { BlogImageDto } from '@vedamatch/shared';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { blogImageAspect, blogImageCounter, blogImageIndex } from '@/lib/blog/blog-feed-state';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Картинки поста — первыми и во всю ширину (VED-238, чек-лист заказчика:
 * «картинку было видно полностью и она растянута на всю длину экрана»).
 *
 * Поэтому `contain`, а не `cover`: обрезать чужую фотографию под рамку
 * значит показать не то, что человек опубликовал. Рамка — по пропорции
 * первого кадра (`blogImageAspect`), так что обычно поле по бокам не видно
 * вовсе. Несколько кадров листаются вбок, как карусель Instagram, а счётчик
 * «2 из 5» стоит на непрозрачной плашке — контраст поверх фотографии не
 * посчитать, поверх `bg1` он известен.
 */
export function BlogImages({ images, label }: { images: readonly BlogImageDto[]; label: string }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(blogImageIndex(event.nativeEvent.contentOffset.x, width, images.length));
    },
    [width, images.length],
  );

  if (images.length === 0) return null;
  const height = width > 0 ? Math.round(width / blogImageAspect(images)) : 0;
  const counter = blogImageCounter(index, images.length);

  return (
    <View onLayout={onLayout} style={[styles.frame, { backgroundColor: colors.bg2, height: height || undefined, aspectRatio: height ? undefined : 1 }]}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          scrollEnabled={images.length > 1}
        >
          {images.map((image, position) => (
            <Image
              key={image.id}
              source={{ uri: image.url }}
              style={{ width, height }}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
              recyclingKey={image.url}
              accessible
              accessibilityRole="image"
              accessibilityLabel={
                images.length > 1 ? `${label}. Фотография ${position + 1} из ${images.length}` : `${label}. Фотография`
              }
            />
          ))}
        </ScrollView>
      ) : null}
      {counter ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.counter, { color: colors.text0, backgroundColor: colors.bg1 }]}
        >
          {counter}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  counter: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
});
