import type { WellnessScanResult } from '@vedamatch/shared';
import { StyleSheet, Text, View } from 'react-native';
import {
  MISSING_PRODUCT_COPY,
  describeVerdict,
  isMissingProduct,
  verdictAccessibilityLabel,
  verdictSections,
  type VerdictTone,
} from '@/lib/wellness/verdict-copy';
import { useTheme } from '@/theme/theme';
import { fonts, radius, type Palette } from '@/theme/tokens';

/**
 * Ответ сканера: крупное слово, что смутило и состав целиком (VED-335).
 *
 * Вынесено из экрана ответа, когда тот же ответ понадобился экрану съёмки
 * состава: правило дизайн-системы — как только вид нужен второму экрану, он
 * переезжает в общий компонент, а не копируется.
 */

const TONE_TOKEN: Record<VerdictTone, keyof Palette> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  // «Не знаем» — не предупреждение и не разрешение: обычный текст.
  neutral: 'text0',
};

export function VerdictCard({ result }: { result: WellnessScanResult }) {
  const { colors } = useTheme();
  const missing = isMissingProduct(result);
  const copy = describeVerdict(result.result.verdict);
  const tone = colors[TONE_TOKEN[copy.tone]];
  const sections = verdictSections(result);

  return (
    <View style={styles.root}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={
          missing
            ? `${MISSING_PRODUCT_COPY.title}. ${MISSING_PRODUCT_COPY.summary}`
            : verdictAccessibilityLabel(result)
        }
        style={[
          styles.card,
          { backgroundColor: colors.glass, borderColor: missing ? colors.glassBorder : tone },
        ]}
      >
        {/* Слово — главное на экране. Порог контраста для него текстовый,
            4.5:1: пара замерена в `theme/contrast.spec.ts`. */}
        <Text style={[styles.verdict, { color: missing ? colors.text0 : tone }]}>
          {missing ? MISSING_PRODUCT_COPY.title : copy.title}
        </Text>
        <Text style={[styles.summary, { color: colors.text1 }]}>
          {missing ? MISSING_PRODUCT_COPY.summary : copy.summary}
        </Text>
      </View>

      {result.product ? (
        <View style={[styles.product, { backgroundColor: colors.bg1 }]}>
          <View style={styles.productText}>
            <Text style={[styles.productName, { color: colors.text0 }]}>
              {result.product.name}
            </Text>
            {result.product.brand ? (
              <Text style={[styles.brand, { color: colors.text1 }]}>
                {result.product.brand}
              </Text>
            ) : null}
            {result.product.source === 'openfoodfacts' ? (
              // Лицензия ODbL требует называть источник — и человеку полезно
              // знать, чьей строке он доверяет.
              <Text style={[styles.brand, { color: colors.text1 }]}>
                Состав из Open Food Facts
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
            {section.title}
          </Text>
          <Text style={[styles.note, { color: colors.text1 }]}>{section.hint}</Text>
          {section.lines.map((line) => (
            <Text
              key={line}
              selectable
              style={[styles.line, { color: colors.text0, backgroundColor: colors.bg1 }]}
            >
              {line}
            </Text>
          ))}
        </View>
      ))}

      {result.ingredientsRaw ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
            Состав целиком
          </Text>
          {/* Выделяемый: человек проверяет нас по строке и иногда хочет её
              переслать — состав важнее удобства вёрстки. */}
          <Text
            selectable
            style={[styles.raw, { color: colors.text0, backgroundColor: colors.bg1 }]}
          >
            {result.ingredientsRaw}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  card: {
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 20,
    gap: 6,
  },
  // 30 px, полужирный: главное слово экрана видно с вытянутой руки в магазине.
  verdict: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 38 },
  summary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  product: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  productText: { flex: 1, gap: 2 },
  productName: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  brand: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: fonts.displayMedium, fontSize: 16 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  line: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  raw: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    padding: 12,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
