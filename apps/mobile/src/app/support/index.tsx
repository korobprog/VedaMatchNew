import type { SupportTicketListResponse } from '@vedamatch/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { SupportHeader } from '@/components/support/support-header';
import { useSession } from '@/lib/auth/session';
import { createSupportApi } from '@/lib/support/support-api';
import { SUPPORT_EMPTY, describeTicketRow } from '@/lib/support/support-copy';
import { describeSupportError, type SupportFailure } from '@/lib/support/support-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Поддержка» в приложении (VED-336): мои обращения и кнопка нового.
 *
 * На сайте поддержка — не переписка в чате, а обращения с номером, статусом
 * и своей лентой сообщений (`/support`, `/support/<id>`). Приложение
 * показывает ТЕ ЖЕ обращения теми же ручками: начатое на сайте продолжается
 * здесь, и наоборот. Отдельной формы «для телефона» с отдельной судьбой
 * сообщений нет.
 *
 * Список перечитывается при каждом возврате на экран: вернулись из нового
 * обращения или из переписки — статус мог поменяться.
 */
export default function SupportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const support = useMemo(() => createSupportApi(api), [api]);

  const [data, setData] = useState<SupportTicketListResponse | null>(null);
  const [failure, setFailure] = useState<SupportFailure | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const response = await support.listMine();
      if (request.current !== id) return;
      setData(response);
      setFailure(null);
    } catch (error) {
      if (request.current === id) setFailure(describeSupportError(error, 'load'));
    } finally {
      if (request.current === id) {
        setRefreshing(false);
        setRetrying(false);
      }
    }
  }, [support]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const now = new Date();

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <SupportHeader title="Поддержка" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            colors={[colors.magenta]}
          />
        }
      >
        <Text style={[styles.lead, { color: colors.text1 }]}>
          Те же обращения, что на сайте: ответ поддержки придёт сюда и уведомлением.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/support/new')}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
        >
          <Text style={[styles.primaryText, { color: colors.onAccent }]}>Написать в поддержку</Text>
        </Pressable>

        {failure ? (
          <View style={styles.block}>
            <InlineError message={failure.message} />
            {failure.retryable ? (
              <RetryButton
                busy={retrying}
                onPress={() => {
                  setRetrying(true);
                  void load();
                }}
              />
            ) : null}
          </View>
        ) : null}

        {!data && !failure ? <ActivityIndicator color={colors.magenta} /> : null}

        {data ? (
          <Text accessibilityRole="header" style={[styles.section, { color: colors.text1 }]}>
            {data.openCount > 0 ? `Мои обращения · в работе: ${data.openCount}` : 'Мои обращения'}
          </Text>
        ) : null}

        {data && data.items.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text style={[styles.emptyTitle, { color: colors.text0 }]}>{SUPPORT_EMPTY.title}</Text>
            <Text style={[styles.emptyBody, { color: colors.text1 }]}>{SUPPORT_EMPTY.body}</Text>
          </View>
        ) : null}

        {data?.items.map((item) => {
          const row = describeTicketRow(item, now);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
              onPress={() => router.push({ pathname: '/support/[id]', params: { id: item.id } })}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.glass, borderColor: row.awaitsUser ? colors.magenta : colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <View style={styles.rowTop}>
                <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text0 }]}>
                  {row.title}
                </Text>
                <Text style={[styles.rowStatus, { color: colors.text0 }]}>{row.status}</Text>
              </View>
              <Text style={[styles.rowDetails, { color: colors.text1 }]}>{row.details}</Text>
              {row.awaitsUser ? (
                <Text style={[styles.rowAwaits, { color: colors.text0 }]}>Поддержка ответила — ждёт вас</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  block: { gap: 12, alignItems: 'flex-start' },
  section: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
  },
  empty: { borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: 16, gap: 8 },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  row: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
    gap: 4,
    overflow: 'hidden',
  },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowTitle: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  rowStatus: { fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 20 },
  rowDetails: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  rowAwaits: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
});
