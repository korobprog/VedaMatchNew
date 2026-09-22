import type { ChatMemberDto, ChatMemberRole } from '@vedamatch/shared';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CHAT_MEMBER_ROLE_LABELS, nextRoleAction } from '@/lib/chat/member-rights';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { ChatAvatar } from './chat-avatar';

interface Props {
  member: ChatMemberDto;
  /** Это я — подписываем строку, чтобы не искать себя в списке глазами. */
  isMe: boolean;
  canSetRole: boolean;
  canRemove: boolean;
  busy: boolean;
  onSetRole(userId: string, role: Exclude<ChatMemberRole, 'owner'>): void;
  onRemove(userId: string, name: string): void;
}

/**
 * Строка участника группы: кто это, какая роль и что с ним можно сделать.
 * Кнопки появляются только те, на которые есть право (`member-rights.ts`),
 * — лишняя кнопка обернулась бы отказом сервера.
 */
function MemberRowImpl({ member, isMe, canSetRole, canRemove, busy, onSetRole, onRemove }: Props) {
  const { colors } = useTheme();
  const role = nextRoleAction(member.role);
  const roleLabel = CHAT_MEMBER_ROLE_LABELS[member.role];

  return (
    <View style={[styles.row, { borderBottomColor: colors.glassBorder }]}>
      <View style={styles.person}>
        <ChatAvatar id={member.user.id} name={member.user.name} uri={member.user.avatarUrl} size={40} />
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
            {member.user.name}
            {isMe ? ' (вы)' : ''}
          </Text>
          <Text style={[styles.role, { color: colors.text1 }]}>{roleLabel}</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.text1} /> : null}
      </View>

      {canSetRole || canRemove ? (
        <View style={styles.actions}>
          {canSetRole ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${role.label}: ${member.user.name}`}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => onSetRole(member.user.id, role.role)}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.action, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
            >
              <Text style={[styles.actionText, { color: colors.text0 }]}>{role.label}</Text>
            </Pressable>
          ) : null}
          {canRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Исключить: ${member.user.name}`}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => onRemove(member.user.id, member.user.name)}
              android_ripple={ripple(colors.magenta)}
              style={({ pressed }) => [styles.action, { borderColor: colors.magenta }, pressedStyle(pressed)]}
            >
              <Text style={[styles.actionText, { color: colors.text0 }]}>Исключить</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const MemberRow = memo(MemberRowImpl);

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, paddingVertical: 10, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  role: { fontFamily: fonts.body, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 52 },
  action: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
