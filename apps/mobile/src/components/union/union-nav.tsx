import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { UNION_SECTIONS, badgeText, type UnionSectionKey } from '@/lib/union/union-sections';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';

/**
 * Строка разделов Знакомств под шапкой. Текущий раздел — заливкой, как
 * активный сегмент «Людей»; счётчик непрочитанных лайков — мятной плашкой,
 * как у «Чатов».
 *
 * Переход — заменой экрана, а не новым поверх: между разделами ходят
 * туда-сюда, и стек «Анкеты → Лайки → Анкеты → Связи» заставлял бы
 * пятиться «назад» через всю историю, чтобы вернуться в каталог.
 */
export function UnionNav({ active, incomingPending = 0 }: { active: UnionSectionKey; incomingPending?: number }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {UNION_SECTIONS.map((section) => {
        const selected = section.key === active;
        const badge = section.key === 'likes' ? badgeText(incomingPending) : null;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={badge ? `${section.title}, новых: ${badge}` : section.title}
            onPress={() => {
              if (!selected) router.replace(section.route as never);
            }}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.tab,
              selected
                ? { backgroundColor: colors.bg2, borderColor: colors.magenta }
                : { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.tabText, { color: selected ? colors.text0 : colors.text1 }]}>{section.title}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: colors.mint }]}>
                <Text style={[styles.badgeText, { color: colors.onMint }]}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tab: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  tabText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
