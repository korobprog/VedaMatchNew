import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { readManualBarcode } from '@/lib/wellness/barcode';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Ручной ввод штрихкода (VED-335) — не запасной костыль, а полноправный путь.
 *
 * Стёртый, смятый или заклеенный ценником код камера не прочитает никогда,
 * сколько ни целься; на замороженных пачках его ещё и запотевает плёнка.
 * Поэтому поле доступно всегда, а не только после отказа в камере.
 *
 * Подсказка под полем меняется по мере набора и не ругается раньше времени:
 * правила — в `lib/wellness/barcode.ts`, проверены тестом.
 */
export function ManualBarcodeForm({
  onSubmit,
  busy = false,
  autoFocus = false,
}: {
  onSubmit(barcode: string): void;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const state = useMemo(() => readManualBarcode(value), [value]);
  const ready = state.kind === 'ready';
  const hint =
    state.kind === 'typing' || state.kind === 'invalid' ? state.hint : null;

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.text1 }]}>
        Код не читается — наберите цифры под полосками
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus={autoFocus}
        inputMode="numeric"
        keyboardType="number-pad"
        returnKeyType="search"
        maxLength={20}
        editable={!busy}
        onSubmitEditing={() => {
          if (ready && !busy) onSubmit(state.barcode);
        }}
        placeholder="4600680000596"
        placeholderTextColor={colors.text1}
        accessibilityLabel="Штрихкод товара, только цифры"
        accessibilityHint={hint ?? undefined}
        style={[
          styles.input,
          {
            color: colors.text0,
            backgroundColor: colors.bg1,
            // Обводка — вторая примета, первая и достаточная — текст ниже.
            borderColor: state.kind === 'invalid' ? colors.danger : colors.glassBorder,
          },
        ]}
      />
      {hint ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.hint,
            { color: state.kind === 'invalid' ? colors.danger : colors.text1 },
          ]}
        >
          {hint}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || busy, busy }}
        disabled={!ready || busy}
        onPress={() => {
          if (ready) onSubmit(state.barcode);
        }}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: colors.magenta,
            // Выключённая кнопка гасится прозрачностью только на заливке:
            // текст на ней остаётся `onAccent`, пара уже замерена.
            opacity: !ready || busy ? 0.45 : 1,
          },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.submitText, { color: colors.onAccent }]}>
          {busy ? 'Проверяем…' : 'Проверить состав'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    fontFamily: fonts.mono,
    fontSize: 17,
  },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  submit: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  submitText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
