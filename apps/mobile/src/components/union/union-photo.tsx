import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { initialOf } from '@/lib/union/union-labels';
import { useTheme } from '@/theme/theme';
import { dark, fonts } from '@/theme/tokens';

/**
 * Снимок человека во всю площадь рамки, а без снимка — первая буква имени.
 *
 * `expo-image`, а не `Image` из RN: он кэширует на диск и не распаковывает
 * одно и то же фото заново при каждом листании колоды. `thumb` — для плиток и
 * миниатюр: полноразмерный снимок там не нужен, память телефона не резиновая
 * (на сайте анкета на десяток фото стоила 77 МБ и роняла вкладку).
 */
export function UnionPhoto({
  uri,
  name,
  initialSize = 64,
  accessibilityLabel,
}: {
  uri: string | null | undefined;
  name: string;
  initialSize?: number;
  /** Подпись для скринридера; без неё снимок декоративный — имя рядом и так видно. */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  if (!uri) {
    return (
      <View
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        style={[styles.fill, styles.center, { backgroundColor: colors.bg2 }]}
      >
        <Text style={[styles.initial, { color: colors.text0, fontSize: initialSize }]}>{initialOf(name)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.fill, { backgroundColor: colors.bg2 }]}
      contentFit="cover"
      transition={0}
      cachePolicy="memory-disk"
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

/**
 * Затемнение низа снимка, чтобы белое имя читалось на любом фото. Цвет —
 * фон тёмной темы, а не чёрный буквально: поверх фото палитра всегда тёмная,
 * независимо от темы телефона (как у просмотрщика статусов).
 */
export function PhotoShade({ height = '55%', strength = 0.92 }: { height?: `${number}%`; strength?: number }) {
  return (
    <View pointerEvents="none" style={[styles.shade, { height }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="unionShade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={dark.bg0} stopOpacity={0} />
            <Stop offset="0.45" stopColor={dark.bg0} stopOpacity={strength * 0.55} />
            <Stop offset="1" stopColor={dark.bg0} stopOpacity={strength} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#unionShade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.displayBold },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
