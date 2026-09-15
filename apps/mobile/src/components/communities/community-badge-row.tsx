import type { CommunityBadgeDto } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { COMMUNITY_KIND_LABELS, COMMUNITY_MEMBER_ROLE_LABELS } from '@/lib/communities/community-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { CommunityVerifiedBadge } from './community-verified-badge';

interface Props {
  community: CommunityBadgeDto;
  /** Нет колбэка — заявка на рассмотрении: строка не нажимается (критерий приёмки 2). */
  onPress?(community: CommunityBadgeDto): void;
}

/** Вид общины, город и роль — если она не рядовой участник. */
function subtitleOf(community: CommunityBadgeDto): string {
  const parts = [COMMUNITY_KIND_LABELS[community.kind]];
  if (community.city) parts.push(community.city);
  if (community.role !== 'member') parts.push(COMMUNITY_MEMBER_ROLE_LABELS[community.role]);
  return parts.join(' · ');
}

function CommunityBadgeRowImpl({ community, onPress }: Props) {
  const { colors } = useTheme();
  const subtitle = subtitleOf(community);

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={`${community.name}. Заявка на рассмотрении. ${subtitle}`}
        style={styles.row}
      >
        <ChatAvatar id={community.id} name={community.name} uri={null} size={48} />
        <View style={styles.body}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text1 }]}>
            {community.name}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text2 }]}>
            {subtitle}
          </Text>
        </View>
        <Text style={[styles.pendingBadge, { color: colors.text1, backgroundColor: colors.bg2 }]}>На рассмотрении</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${community.name}${community.isVerified ? ', подтверждена' : ''}. ${subtitle}`}
      accessibilityHint="Открывает группы и каналы общины"
      onPress={() => onPress(community)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, pressedStyle(pressed)]}
    >
      <ChatAvatar id={community.id} name={community.name} uri={null} size={48} />
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text0 }]}>
            {community.name}
          </Text>
          {community.isVerified ? <CommunityVerifiedBadge /> : null}
        </View>
        <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text1 }]}>
          {subtitle}
        </Text>
      </View>
      <Text importantForAccessibility="no" style={[styles.chevron, { color: colors.text2 }]}>
        ›
      </Text>
    </Pressable>
  );
}

export const CommunityBadgeRow = memo(CommunityBadgeRowImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: hitTarget + 20, paddingVertical: 12 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 16 },
  subtitle: { fontFamily: fonts.body, fontSize: 13 },
  pendingBadge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  chevron: { fontFamily: fonts.bodyBold, fontSize: 20 },
});
