import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

function SearchIcon({ color }: { color: string }) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z" {...stroke} />
      <Line x1={21} y1={21} x2={16.7} y2={16.7} {...stroke} />
    </Svg>
  );
}

function ClearIcon({ color }: { color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const };
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Line x1={6} y1={6} x2={18} y2={18} {...stroke} />
      <Line x1={18} y1={6} x2={6} y2={18} {...stroke} />
    </Svg>
  );
}

interface Props {
  value: string;
  onChange(next: string): void;
  /** Запрос ушёл и ответа ещё нет — говорим об этом словом. */
  busy: boolean;
}

/**
 * Поиск по ленте уведомлений (VED-330, раунд оценки 001, дефект 3).
 *
 * Ищет сервер (`?q`, VED-267), а не отбор по загруженному: тот искал бы
 * только среди пришедших порций и отвечал бы «ничего не нашлось» о том, до
 * чего человек не долистал.
 *
 * Своей обводки фокуса не рисуем: на Android её даёт система, а рамка поля
 * меняет цвет на `--vm-magenta` — это подсказка, а не замена обводке. Высота
 * поля — `hitTarget`, крестик очистки — отдельная кнопка такого же размера.
 */
export function InboxSearchBox({ value, onChange, busy }: Props) {
  const { colors } = useTheme();
  const filled = value.length > 0;

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.bg1,
            borderColor: filled ? colors.magenta : colors.glassBorder,
          },
        ]}
      >
        <SearchIcon color={colors.text1} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Поиск по уведомлениям"
          placeholderTextColor={colors.text1}
          accessibilityLabel="Поиск по уведомлениям"
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.input, { color: colors.text0 }]}
        />
        {filled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            onPress={() => onChange('')}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [styles.clear, pressedStyle(pressed)]}
          >
            <ClearIcon color={colors.text1} />
          </Pressable>
        ) : null}
      </View>
      {/* Состояние поиска словами: скринридер узнаёт, что запрос ушёл, а
          зрячий человек — что список сейчас обновится. Место занято всегда,
          чтобы поле не дёргалось по ширине на каждую букву. */}
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.busy, { color: colors.text1 }]}
      >
        {busy && filled ? 'Ищем…' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, paddingVertical: 0 },
  clear: {
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  busy: { width: 44, fontFamily: fonts.body, fontSize: 12 },
});
