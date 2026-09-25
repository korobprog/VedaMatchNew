import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UnionTagOption } from '@/lib/union/union-dictionaries';
import { normalizeTag } from '@/lib/union/union-profile-form';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Поля своей анкеты без ввода текста: выбор одного из списка, нескольких,
 * теги. Поля с клавиатурой живут в самом экране анкеты — там, где стоит
 * обёртка, поднимающая их над клавиатурой (`theme/keyboard-scan.ts`).
 *
 * На сайте каждое поле раскрывается строкой «значение → изменить»; на
 * телефоне выбор виден сразу чипами: одно касание вместо двух, и не надо
 * помнить, что было выбрано, — выбранное подсвечено.
 */

/** Карточка раздела анкеты с заголовком. */
export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text1 }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Подпись поля и необязательная подсказка под ней. */
export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color: colors.text0 }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: colors.text1 }]}>{hint}</Text> : null}
    </View>
  );
}

function Chip({
  label,
  selected,
  role,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress(): void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { borderColor: colors.magenta, backgroundColor: colors.bg2 }
          : { borderColor: colors.glassBorder, backgroundColor: colors.bg1 },
        disabled ? styles.disabled : pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.text0 : colors.text1 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Один из списка или «не указано». Повторное касание выбранного снимает
 * выбор: поле необязательное, и способ его очистить должен быть.
 */
export function ChoiceChips<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  hint?: string;
  options: readonly (readonly [T, string])[];
  value: T | null;
  onChange(value: T | null): void;
  allowEmpty?: boolean;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} hint={hint} />
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
        {options.map(([key, text]) => (
          <Chip
            key={key}
            label={text}
            role="radio"
            selected={value === key}
            onPress={() => onChange(value === key && allowEmpty ? null : key)}
          />
        ))}
      </View>
    </View>
  );
}

/** Несколько из списка — регулирующие принципы. Пустой выбор значит «не указано». */
export function MultiChips<T extends string>({
  label,
  hint,
  options,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly (readonly [T, string])[];
  values: readonly T[];
  onChange(values: T[]): void;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} hint={hint} />
      <View accessibilityLabel={label} style={styles.chips}>
        {options.map(([key, text]) => {
          const selected = values.includes(key);
          return (
            <Chip
              key={key}
              label={text}
              role="checkbox"
              selected={selected}
              onPress={() => onChange(selected ? values.filter((item) => item !== key) : [...values, key])}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * Теги: варианты из списка переключаются касанием, свои — показаны рядом и
 * снимаются тем же касанием. Поле «добавить свой» экран рисует сам под этим
 * блоком (`children`).
 */
export function TagChips({
  label,
  hint,
  options,
  selected,
  onToggle,
  children,
}: {
  label: string;
  hint?: string;
  options: readonly UnionTagOption[] | readonly { title: string; options: readonly UnionTagOption[] }[];
  selected: readonly string[];
  onToggle(value: string): void;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const groups: readonly { title: string | null; options: readonly UnionTagOption[] }[] =
    options.length > 0 && 'title' in options[0]
      ? (options as readonly { title: string; options: readonly UnionTagOption[] }[])
      : [{ title: null, options: options as readonly UnionTagOption[] }];
  const known = new Set(groups.flatMap((group) => group.options.map((option) => normalizeTag(option.value))));
  const custom = selected.filter((value) => !known.has(normalizeTag(value)));
  const isOn = (value: string) => selected.some((item) => normalizeTag(item) === normalizeTag(value));

  return (
    <View style={styles.field}>
      <FieldLabel label={label} hint={hint} />
      {groups.map((group) => (
        <View key={group.title ?? 'all'} style={styles.group}>
          {group.title ? <Text style={[styles.groupTitle, { color: colors.text1 }]}>{group.title}</Text> : null}
          <View style={styles.chips}>
            {group.options.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                role="checkbox"
                selected={isOn(option.value)}
                onPress={() => onToggle(option.value)}
              />
            ))}
          </View>
        </View>
      ))}
      {custom.length > 0 ? (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.text1 }]}>Свои</Text>
          <View style={styles.chips}>
            {custom.map((value) => (
              <Chip key={value} label={`${value} ✕`} role="checkbox" selected onPress={() => onToggle(value)} />
            ))}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Строка «значение из профиля портала» с переходом туда, где его меняют. */
export function PortalFieldRow({
  label,
  value,
  empty,
  action,
}: {
  label: string;
  value: string | null;
  empty: string;
  action?: { label: string; onPress(): void };
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.portalRow}>
      <View style={styles.portalText}>
        <Text style={[styles.hint, { color: colors.text1 }]}>{label}</Text>
        <Text style={[styles.portalValue, { color: colors.text0 }]}>{value ?? empty}</Text>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.label}: ${label}`}
          onPress={action.onPress}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.portalButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.portalButtonText, { color: colors.text0 }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 16 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  field: { gap: 8 },
  labelWrap: { gap: 2 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  disabled: { opacity: 0.5 },
  group: { gap: 6 },
  groupTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  portalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portalText: { flex: 1, gap: 2 },
  portalValue: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  portalButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  portalButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
});
