import type { ContactsCardDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { PhotoVerifiedBadge, VerifiedBadge } from '@/components/verified-badge';
import { verificationA11yParts, visibleVerificationBadges } from '@/lib/people/verification';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  card: ContactsCardDto;
  /** Id вместо замыкания: колбэк один на весь список, и memo строки не сбрасывается. */
  onPress(userId: string): void;
}

/** Строка справочника «Люди»: аватар, имя со значками подтверждения, заголовок карточки, город. */
function PersonCardRowImpl({ card, onPress }: Props) {
  const { colors } = useTheme();
  const subtitle = card.headline ?? card.statusLine;
  const place = [card.city, card.country].filter(Boolean).join(', ');
  const badges = visibleVerificationBadges(card);
  // Значки внутри строки не объявляются отдельно: строка — один
  // Pressable-узел с общей подписью, значки в неё уже входят.
  const a11yParts = [card.name, subtitle, place, ...verificationA11yParts(card)].filter((part): part is string => Boolean(part));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yParts.join(', ')}
      onPress={() => onPress(card.userId)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.glass }, pressedStyle(pressed)]}
    >
      <ChatAvatar id={card.userId} name={card.name} uri={card.avatarUrl} size={52} />
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
            {card.name}
          </Text>
          {badges.length > 0 ? (
            // Подписи значков уже вошли в accessibilityLabel строки —
            // сами значки из дерева скринридера не выкусываем (они всё
            // равно `accessible` для случая, когда компонент используется
            // отдельно), а прячем именно вложенные узлы этой группы.
            <View importantForAccessibility="no-hide-descendants" style={styles.badgeGroup}>
              {badges.map((kind) => (kind === 'devotee' ? <VerifiedBadge key={kind} variant="dot" /> : <PhotoVerifiedBadge key={kind} variant="dot" />))}
            </View>
          ) : null}
        </View>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text1 }]}>
            {subtitle}
          </Text>
        ) : null}
        {place ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text1 }]}>
            {place}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const PersonCardRow = memo(PersonCardRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    overflow: 'hidden',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 15 },
  badgeGroup: { flexDirection: 'row', flexShrink: 0, gap: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
});
