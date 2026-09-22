import type { NotificationItemDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWhen } from '@/lib/notifications/inbox-state';
import {
  cardAccessibilityHint,
  cardAccessibilityLabel,
  categoryLabel,
  markAccessibilityLabel,
  markView,
} from '@/lib/notifications/notification-copy';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  item: NotificationItemDto;
  /** Нажатие ведёт не в приложение, а на сайт — это надо сказать заранее. */
  opensSite: boolean;
  onPress(item: NotificationItemDto): void;
  /** Передаётся снаружи, чтобы весь список считал время от одного момента:
   *  иначе «5 мин назад» и «6 мин назад» на соседних карточках — от разных. */
  now: Date;
}

/**
 * Карточка уведомления (VED-330).
 *
 * Непрочитанное отличается тремя приметами сразу, и ни одна из них не цвет
 * в одиночку: точка `magenta` слева, заголовок полужирным `text0` и слово
 * «Не прочитано» в подписи для скринридера. Прочитанное не прячется и не
 * гасится прозрачностью — `opacity` уронила бы заодно и вторичный текст
 * ниже порога контраста (та же ошибка, что чинили на сайте): заголовок
 * просто становится `text1`, а точка исчезает.
 *
 * Вся карточка — одна зона нажатия высотой не меньше 44: попадать пальцем в
 * заголовок не надо.
 */
function NotificationCardView({ item, opensSite, onPress, now }: Props) {
  const { colors } = useTheme();
  const unread = item.readAt === null;
  const when = formatWhen(item.createdAt, now);
  const section = categoryLabel(item.category);
  const mark = markView(item.mark);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardAccessibilityLabel({
        title: item.title,
        body: item.body,
        when,
        category: item.category,
        unread,
        mark: item.mark,
      })}
      accessibilityHint={cardAccessibilityHint(opensSite)}
      onPress={() => onPress(item)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.glass,
          borderColor: unread ? colors.magenta : colors.glassBorder,
        },
        pressedStyle(pressed),
      ]}
    >
      {/* Точка непрочитанного — графика, смысла в одиночку не несёт:
          то же самое говорят полужирный заголовок и подпись для
          скринридера. Порог для неё 3:1 (`theme/contrast.spec.ts`). */}
      <View
        style={[styles.dot, { backgroundColor: unread ? colors.magenta : 'transparent' }]}
        importantForAccessibility="no"
      />
      <View style={styles.body}>
        <View style={styles.topRow}>
          {section ? (
            <Text
              numberOfLines={1}
              style={[styles.section, { color: colors.text1 }]}
              importantForAccessibility="no"
            >
              {section}
            </Text>
          ) : (
            <View style={styles.sectionSpacer} />
          )}
          <Text style={[styles.when, { color: colors.text1 }]} importantForAccessibility="no">
            {when}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            {
              color: unread ? colors.text0 : colors.text1,
              fontFamily: unread ? fonts.bodyBold : fonts.bodySemiBold,
            },
          ]}
          importantForAccessibility="no"
        >
          {item.title}
        </Text>
        {item.body ? (
          <Text
            selectable
            numberOfLines={4}
            style={[styles.text, { color: colors.text1 }]}
            importantForAccessibility="no"
          >
            {item.body}
          </Text>
        ) : null}
        {mark ? (
          <View style={styles.markRow}>
            <Text
              accessibilityLabel={markAccessibilityLabel(mark)}
              importantForAccessibility="no"
              style={[styles.mark, { color: colors.text0, borderColor: colors[mark.border] }]}
            >
              {mark.label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * `memo`: лента перерисовывается на каждую отметку о прочтении, а карточек
 * на экране два десятка. Пропсы у карточки — сам объект, две строки и `now`,
 * все стабильные между отметками.
 */
export const NotificationCard = memo(NotificationCardView);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 12 },
  sectionSpacer: { flex: 1 },
  when: { fontFamily: fonts.body, fontSize: 12 },
  title: { fontSize: 15, lineHeight: 20 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  markRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  mark: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
