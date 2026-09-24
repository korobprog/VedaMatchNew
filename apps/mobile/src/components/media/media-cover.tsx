import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { radius } from '@/theme/tokens';
import { NoteGlyph } from './media-icons';

/**
 * Обложка записи или книги. Нет адреса или картинка не загрузилась — нота на
 * `bg2`, а не пустой прямоугольник: пустое место в списке выглядит сломанным.
 * Декоративная: название рядом говорит всё, что нужно скринридеру.
 */
export function MediaCover({ uri, size }: { uri: string | null; size: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, backgroundColor: colors.bg2 };
  return (
    <View style={[styles.box, box]} accessible={false} importantForAccessibility="no-hide-descendants">
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : (
        <NoteGlyph color={colors.text1} size={Math.round(size * 0.42)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
