import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { initialOf } from '@/lib/chat/chat-format';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';
import type { Palette } from '@/theme/tokens';

/** Цвет заглушки по id человека: один и тот же у одного человека везде. */
function accentFor(id: string, colors: Palette): string {
  const choices = [colors.magenta, colors.cyan, colors.gold, colors.violet, colors.blue];
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return choices[hash % choices.length];
}

interface Props {
  id: string;
  name: string;
  uri?: string | null;
  size?: number;
  online?: boolean;
}

export function ChatAvatar({ id, name, uri, size = 52, online = false }: Props) {
  const { colors } = useTheme();
  const radius = Math.round(size * 0.3);
  const accent = accentFor(id, colors);

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.bg2 }}
          contentFit="cover"
          // Плавное появление вместо вспышки и кэш на диске: в списке одни и
          // те же лица при каждом открытии. recyclingKey не даёт строке
          // списка на мгновение показать чужой аватар.
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: colors.bg2 }]}>
          <Text style={[styles.letter, { color: accent, fontSize: Math.round(size * 0.34) }]}>{initialOf(name)}</Text>
        </View>
      )}
      {online ? (
        // «В сети» озвучивается в подписи строки или шапки, у точки своей нет.
        <View
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[styles.online, { backgroundColor: colors.cyan, borderColor: colors.bg0 }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.displayBold },
  online: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
