import { StyleSheet, Switch, Text, View } from 'react-native';
import { HOME_SECTIONS } from '@/lib/home/home-sections';
import { homeSectionsStore, useHomeSections } from '@/lib/home/home-sections-store';
import { useTheme } from '@/theme/theme';
import { fonts, radius } from '@/theme/tokens';

/**
 * Раздел «Главная (Чаты)» в «Настройках»: по тумблеру на каждый блок над
 * списком бесед. Что это за блоки, их подписи и умолчания — в
 * `lib/home/home-sections.ts`; здесь только отрисовка.
 *
 * Тумблер — системный `Switch`, как «О чём уведомлять» на экране
 * «Аккаунт»: то же устройство и те же цвета, чтобы два раздела настроек в
 * приложении не выглядели по-разному. Сохранение на телефоне мгновенное,
 * поэтому тумблер не ждёт и не блокируется.
 */
export function HomeSectionsSettings() {
  const { colors } = useTheme();
  const sections = useHomeSections();

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
        Главная (Чаты)
      </Text>
      <Text style={[styles.hint, { color: colors.text1 }]}>
        Что показывать над списком бесед. Выбор хранится на этом телефоне.
      </Text>
      {HOME_SECTIONS.map((section) => (
        <View
          key={section.key}
          style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: colors.text0 }]}>{section.label}</Text>
            <Text style={[styles.rowNote, { color: colors.text1 }]}>{section.note}</Text>
          </View>
          <Switch
            accessibilityRole="switch"
            accessibilityLabel={`${section.label} на главной`}
            accessibilityHint={section.note}
            accessibilityState={{ checked: sections[section.key] }}
            value={sections[section.key]}
            onValueChange={(next) => void homeSectionsStore.set(section.key, next)}
            trackColor={{ false: colors.glassBorder, true: colors.cyan }}
            thumbColor={colors.onAccent}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
  },
  rowText: { flex: 1, gap: 4 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  rowNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
});
