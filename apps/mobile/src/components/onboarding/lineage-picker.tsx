import { lineagesByGroup, type LineageId } from '@vedamatch/shared';
import { StyleSheet, Text, View } from 'react-native';
import { OptionChips } from '@/components/option-chips';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

/**
 * Выбор духовной линии — то же, что карточки `lineage-picker.tsx` на сайте,
 * и из того же справочника `@vedamatch/shared`: список меняется правкой
 * одного файла в общем пакете, а не копией здесь.
 *
 * Разбит на три группы (ISKCON, Гаудия-матх, паривары) — как в `<optgroup>`
 * на сайте. Каждая группа — своя радиогруппа `OptionChips`: скринридер
 * говорит «Гаудия-матх, выбрано 2 из 4», а не перечисляет десять кнопок
 * подряд. Выбор один на все группы: значение из чужой группы просто не
 * совпадает ни с одним её чипом, и выбранным там не подсвечено ничего.
 *
 * Пропустить можно: линия не обязательна, и её же потом предлагают выбрать
 * Образование и Музыка (`lineage-prompt.tsx` на сайте).
 */
export function LineagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: LineageId | '';
  onChange(next: LineageId): void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        К какой линии вы принадлежите?
      </Text>
      <Text style={[styles.hint, { color: colors.text1 }]}>
        По ответам вы преданный. Выберите своё общество, матх или паривар — Образование и Музыка будут
        показывать материалы вашей традиции. Можно пропустить и указать позже в профиле на сайте.
      </Text>
      {lineagesByGroup().map((group) => (
        <OptionChips<LineageId | ''>
          key={group.group}
          label={group.label}
          value={value}
          disabled={disabled}
          onChange={(next) => {
            if (next !== '') onChange(next);
          }}
          options={group.items.map((item) => ({ value: item.id as LineageId | '', label: item.shortLabel }))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { fontFamily: fonts.displayMedium, fontSize: 17, lineHeight: 24 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
});
