import type { ContactsCardDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  card: ContactsCardDto;
  /** Id вместо замыкания: колбэк один на весь список, и memo строки не сбрасывается. */
  onPress(userId: string): void;
}

/** Строка справочника «Люди»: аватар, имя, заголовок карточки, город, значок преданного. */
function PersonCardRowImpl({ card, onPress }: Props) {
  const { colors } = useTheme();
  const subtitle = card.headline ?? card.statusLine;
  const place = [card.city, card.country].filter(Boolean).join(', ');
  const a11yParts = [card.name, subtitle, place, card.isVerifiedDevotee ? 'подтверждённый преданный' : null].filter(
    (part): part is string => Boolean(part),
  );

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
        <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
          {card.name}
        </Text>
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
      {card.isVerifiedDevotee ? (
        <View style={[styles.badge, { backgroundColor: colors.mint }]}>
          <Text style={[styles.badgeText, { color: colors.onMint }]}>Преданный</Text>
        </View>
      ) : null}
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
  name: { fontFamily: fonts.bodyBold, fontSize: 15 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
