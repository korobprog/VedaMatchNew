import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnionNav } from '@/components/union/union-nav';
import { unionHeaderOptions } from '@/components/union/union-screen-parts';
import { useIncomingPending, useUnionApi } from '@/components/union/use-union';
import { UNION_COLLECTIONS } from '@/lib/union/union-collections';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Подборки — готовые наборы фильтров поверх обычного подбора
 * (`/union/collections` на сайте). Нажатие открывает подбор с фильтром
 * подборки новым экраном поверх: «назад» возвращает сюда, к списку, —
 * подборки смотрят одну за другой.
 */
export default function UnionCollectionsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const incomingPending = useIncomingPending(useUnionApi());

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Подборки')} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <UnionNav active="collections" incomingPending={incomingPending} />
        <Text style={[styles.lead, { color: colors.text1 }]}>
          Готовые наборы фильтров — быстрый способ посмотреть анкеты под конкретный запрос.
        </Text>
        <View style={styles.list}>
          {UNION_COLLECTIONS.map((collection) => (
            <Pressable
              key={collection.key}
              accessibilityRole="button"
              accessibilityLabel={`${collection.title}. ${collection.description}`}
              onPress={() => router.push({ pathname: '/union/recommendations', params: { collection: collection.key } })}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.title, { color: colors.text0 }]}>{collection.title}</Text>
              <Text style={[styles.description, { color: colors.text1 }]}>{collection.description}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 4,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.displayMedium, fontSize: 16 },
  description: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
