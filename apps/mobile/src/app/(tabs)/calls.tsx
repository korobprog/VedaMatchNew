import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ChatCallDto } from '@vedamatch/shared';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { Screen } from '@/components/screen';
import { ChatListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth/session';
import { callCompanion, callDirection, callSummaryLine, isMissedCall } from '@/lib/calls/call-history-format';
import { createChatCallsApi } from '@/lib/calls/chat-calls-client';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from '@/lib/calls/native-call-bridge';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Вкладка «Звонки» (VED-219) — история личных звонков вместо заглушки.
 * Долгое нажатие на заголовок — прежний скрытый вход в служебную «Проверку
 * связи» (этап 0, VED-218), сохранён на том же месте.
 */
type Phase = 'loading' | 'ready' | 'error';

export default function CallsScreen() {
  const { colors } = useTheme();
  const { api, user } = useSession();
  const callsApi = useMemo(() => createChatCallsApi(api), [api]);
  const userId = user?.id ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [calls, setCalls] = useState<ChatCallDto[]>([]);
  const [retrying, setRetrying] = useState(false);
  // Android 14+ может не выдать полноэкранный intent молча (VED-221, п.7) —
  // без него входящий на заблокированном экране падает до обычного
  // heads-up уведомления. Перепроверяем при каждом возврате на вкладку:
  // человек мог зайти в системные настройки прямо из баннера ниже и
  // вернуться назад.
  const [canFullScreen, setCanFullScreen] = useState(true);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'android') setCanFullScreen(canUseFullScreenIntent());
    }, []),
  );

  const load = useCallback(
    async (isRetry = false) => {
      if (isRetry) setRetrying(true);
      else setPhase('loading');
      try {
        const history = await callsApi.history();
        setCalls(history);
        setPhase('ready');
      } catch {
        setPhase('error');
      } finally {
        setRetrying(false);
      }
    },
    [callsApi],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const callBack = useCallback((call: ChatCallDto) => {
    confirmTap();
    router.push({ pathname: '/chat/[id]', params: { id: call.conversationId } });
  }, []);

  return (
    <Screen
      title="Звонки"
      subtitle="История звонков в личных беседах."
      onTitleLongPress={() => router.push('/calls-probe')}
    >
      {!canFullScreen ? (
        <View style={[styles.permissionBanner, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          <Text style={[styles.permissionTitle, { color: colors.text0 }]}>
            Входящие звонки не покажутся на заблокированном экране
          </Text>
          <Text style={[styles.permissionText, { color: colors.text1 }]}>
            Android просит разрешить это отдельно. Без него звонок всё равно придёт — обычным уведомлением.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Разрешить звонки на экране блокировки"
            onPress={() => {
              confirmTap();
              openFullScreenIntentSettings();
            }}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.permissionButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            <Text style={[styles.permissionButtonText, { color: colors.text0 }]}>Разрешить в настройках</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === 'loading' ? (
        <ChatListSkeleton inset={false} />
      ) : phase === 'error' ? (
        <View style={styles.errorBlock}>
          <InlineError message="Не удалось загрузить историю звонков" />
          <RetryButton onPress={() => void load(true)} busy={retrying} />
        </View>
      ) : calls.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
          <Text style={[styles.emptyTitle, { color: colors.text0 }]}>Звонков пока не было</Text>
          <Text style={[styles.emptyText, { color: colors.text1 }]}>
            Звонок начинается из личной переписки — откройте беседу и нажмите на трубку в шапке.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {calls.map((call) => {
            const companion = callCompanion(call, userId);
            const missed = isMissedCall(call.status) && callDirection(call, userId) === 'incoming';
            return (
              <View key={call.id} style={[styles.row, { borderColor: colors.glassBorder }]}>
                <ChatAvatar id={companion.id} name={companion.name} uri={companion.avatarUrl} size={48} />
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: missed ? colors.magenta : colors.text0 }]}>
                    {companion.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.rowSummary, { color: colors.text1 }]}>
                    {callSummaryLine(call, userId)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Перезвонить ${companion.name}`}
                  onPress={() => callBack(call)}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.callBack, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
                >
                  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={colors.text0} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                  </Svg>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  permissionBanner: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 8, marginBottom: 12 },
  permissionTitle: { fontFamily: fonts.bodyBold, fontSize: 14 },
  permissionText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  permissionButton: {
    alignSelf: 'flex-start',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  permissionButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  errorBlock: { gap: 12, alignItems: 'flex-start' },
  empty: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 6 },
  emptyTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  rowSummary: { fontFamily: fonts.body, fontSize: 12 },
  callBack: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
