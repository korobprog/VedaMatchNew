import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Строка-галочка анкеты: «Есть наставник», «Участвую в служении».
 *
 * Отдельного нативного чекбокса в приложении нет и не заводится: строка
 * целиком — зона нажатия (не меньше `hitTarget`), а скринридеру она
 * представляется как `checkbox` с состоянием, поэтому «выбрано/не выбрано»
 * он проговаривает сам. Состояние показано не только цветом: квадратик
 * слева либо пуст, либо с галочкой.
 */
export function CheckRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.bg1, borderColor: checked ? colors.magenta : colors.glassBorder },
        disabled ? styles.disabled : pressedStyle(pressed),
      ]}
    >
      <View
        style={[
          styles.box,
          { borderColor: checked ? colors.magenta : colors.glassBorder, backgroundColor: checked ? colors.magenta : 'transparent' },
        ]}
      >
        {checked ? <Text style={[styles.tick, { color: colors.onAccent }]}>✓</Text> : null}
      </View>
      <Text style={[styles.label, { color: colors.text0 }]}>{label}</Text>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  box: { width: 22, height: 22, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  tick: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 16 },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 20 },
  disabled: { opacity: 0.6 },
});
