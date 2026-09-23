import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchItem } from '@/lib/search/search-results';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Строка выдачи поиска (VED-337). Уход на сайт объявлен заранее — словом
 * «на сайте» справа и подсказкой скринридеру: человек должен знать, что
 * нажатие откроет браузер, до того как нажмёт.
 */
export function SearchResultRow({ item, onPress }: { item: SearchItem; onPress(item: SearchItem): void }) {
  const { colors } = useTheme();
  const site = item.target.kind === 'site';
  return (
    <Pressable
      accessibilityRole={site ? 'link' : 'button'}
      accessibilityLabel={item.accessibilityLabel}
      accessibilityHint={site ? 'Откроется сайт VedaMatch в браузере' : undefined}
      onPress={() => onPress(item)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.glass, borderColor: colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <View style={styles.text}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text0 }]}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text numberOfLines={2} style={[styles.subtitle, { color: colors.text1 }]}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={[site ? styles.site : styles.arrow, { color: colors.text1 }]}>{site ? 'на сайте ↗' : '›'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  site: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  arrow: { fontFamily: fonts.body, fontSize: 20 },
});
