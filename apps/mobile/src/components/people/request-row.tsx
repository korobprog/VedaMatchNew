import type { ContactsRequestDto } from '@vedamatch/shared';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { formatChatStamp } from '@/lib/chat/chat-format';
import { CONTACTS_REQUEST_STATUS_LABELS, canCancel, canRespond, canWrite, type RequestAction } from '@/lib/people/people-requests-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { PeopleDetails } from './people-details';

interface Props {
  request: ContactsRequestDto;
  /** Действие по этому запросу в процессе: занята только его кнопка. */
  busyAction: RequestAction | null;
  /** Ошибка последнего действия по этому запросу — не общий баннер экрана. */
  error: string | null;
  onRespond(request: ContactsRequestDto, accept: boolean): void;
  onCancel(request: ContactsRequestDto): void;
  onWrite(request: ContactsRequestDto): void;
}

/** Строка запроса контакта: входящий или исходящий — карточка знает сама по `direction`. */
function RequestRowImpl({ request, busyAction, error, onRespond, onCancel, onWrite }: Props) {
  const { colors } = useTheme();
  const busy = busyAction !== null;
  const subtitle = [request.user.headline, request.user.city].filter(Boolean).join(' · ');
  const showRespond = canRespond(request);
  const showCancel = canCancel(request);
  const showWrite = canWrite(request);

  return (
    <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <View style={styles.header}>
        <ChatAvatar id={request.user.userId} name={request.user.name} uri={request.user.avatarUrl} size={44} />
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
            {request.user.name}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.meta, { color: colors.text1 }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.stamp, { color: colors.text1 }]}>{formatChatStamp(request.createdAt)}</Text>
      </View>

      {request.message ? (
        <Text selectable style={[styles.message, { color: colors.text0, borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          {request.message}
        </Text>
      ) : null}

      <Text style={[styles.status, { color: colors.text1 }]}>
        {CONTACTS_REQUEST_STATUS_LABELS[request.status]}
        {request.respondedAt ? ` · ${formatChatStamp(request.respondedAt)}` : ''}
      </Text>

      {/* Контакты — главный результат принятого запроса; без них «Контакты
          открыты» была бы пустой формулировкой (раунд оценки 004, дефект 4). */}
      {request.contacts ? <PeopleDetails contacts={request.contacts} /> : null}

      {error ? <InlineError message={error} /> : null}

      {showRespond ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Принять запрос контакта от ${request.user.name}`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => onRespond(request, true)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.mint, borderColor: colors.mint },
              busy ? styles.busy : pressedStyle(pressed),
            ]}
          >
            {busyAction === 'accept' ? <ActivityIndicator color={colors.onMint} /> : <Text style={[styles.primaryText, { color: colors.onMint }]}>Принять</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Отклонить запрос контакта от ${request.user.name}`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => onRespond(request, false)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.secondary, styles.grow, { borderColor: colors.glassBorder }, busy ? styles.busy : pressedStyle(pressed)]}
          >
            {busyAction === 'decline' ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.secondaryText, { color: colors.text0 }]}>Отклонить</Text>}
          </Pressable>
        </View>
      ) : null}

      {showCancel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Отозвать запрос контакта к ${request.user.name}`}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => onCancel(request)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.secondary, { borderColor: colors.glassBorder, alignSelf: 'flex-start' }, busy ? styles.busy : pressedStyle(pressed)]}
        >
          {busyAction === 'cancel' ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.secondaryText, { color: colors.text0 }]}>Отозвать</Text>}
        </Pressable>
      ) : null}

      {showWrite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Написать ${request.user.name}`}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => onWrite(request)}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.magenta, borderColor: colors.magenta, alignSelf: 'flex-start', flex: undefined, paddingHorizontal: 20 }, busy ? styles.busy : pressedStyle(pressed)]}
        >
          {busyAction === 'write' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={[styles.primaryText, { color: colors.onAccent }]}>Написать</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

export const RequestRow = memo(RequestRowImpl);

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  stamp: { fontFamily: fonts.body, fontSize: 12, fontVariant: ['tabular-nums'] },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  status: { fontFamily: fonts.body, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  busy: { opacity: 0.6 },
});
