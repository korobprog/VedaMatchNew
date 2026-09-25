import type { UnionArchiveEntry, UserBlockDto } from '@vedamatch/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { UnionNav } from '@/components/union/union-nav';
import {
  UnionButton,
  UnionEmpty,
  UnionLoadFailed,
  UnionLoading,
  unionHeaderOptions,
} from '@/components/union/union-screen-parts';
import { useIncomingPending, useUnionApi } from '@/components/union/use-union';
import { describeUnionError } from '@/lib/union/union-error';
import { placeLine } from '@/lib/union/union-lists';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

type Tab = 'archive' | 'blocked';

interface Hidden {
  archive: UnionArchiveEntry[];
  blocked: UserBlockDto[];
}

/**
 * Скрытые мной (`/union/hidden` на сайте): архив и блокировки — одна
 * сущность «спрятанные мной», разные причины, поэтому один раздел с двумя
 * вкладками, а не два пункта меню.
 *
 * На сайте снять блокировку можно только со страницы анкеты
 * (`blocked-users-panel.tsx`), а здесь — прямо в списке: искать, где
 * разблокировать человека, которого только что увидел в списке, незачем.
 */
export default function UnionHiddenScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unionApi = useUnionApi();
  const incomingPending = useIncomingPending(unionApi);
  const [tab, setTab] = useState<Tab>('archive');
  const [hidden, setHidden] = useState<Hidden | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      setLoadError(null);
      try {
        const [archive, blocks] = await Promise.all([unionApi.archiveList(), unionApi.blocks()]);
        setHidden({ archive: archive.items, blocked: blocks.blocked });
      } catch (e) {
        setLoadError(describeUnionError(e, 'Не удалось загрузить скрытых.'));
      } finally {
        setRefreshing(false);
      }
    },
    [unionApi],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = async (userId: string, action: () => Promise<unknown>, fallback: string) => {
    if (busyId) return;
    setBusyId(userId);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setActionError(describeUnionError(e, fallback));
    } finally {
      setBusyId(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'archive', label: `Архив · ${hidden?.archive.length ?? 0}` },
    { key: 'blocked', label: `Заблокированные · ${hidden?.blocked.length ?? 0}` },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Скрытые')} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.magenta}
            colors={[colors.magenta]}
          />
        }
      >
        <UnionNav active="hidden" incomingPending={incomingPending} />
        <Text style={[styles.lead, { color: colors.text1 }]}>
          Кого вы убрали из выдачи сами. Архив можно вернуть в любой момент.
        </Text>

        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.bg1 }]}>
          {tabs.map((item) => {
            const selected = item.key === tab;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(item.key)}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.tab, selected && { backgroundColor: colors.bg0 }, pressedStyle(pressed)]}
              >
                <Text style={[styles.tabText, { color: selected ? colors.text0 : colors.text1 }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {actionError ? (
          <View style={styles.padded}>
            <InlineError message={actionError} />
          </View>
        ) : null}

        {!hidden ? (
          loadError ? (
            <UnionLoadFailed message={loadError} onRetry={() => void load()} />
          ) : (
            <UnionLoading label="Загружаем скрытых" />
          )
        ) : tab === 'archive' ? (
          hidden.archive.length === 0 ? (
            <UnionEmpty text="Архив пуст. Сюда попадают анкеты, убранные кнопкой «В архив» в колоде, — в выдаче они больше не появятся, пока вы их не вернёте." />
          ) : (
            hidden.archive.map((entry) => (
              <View key={entry.user.id} style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${entry.user.name}. Открыть анкету`}
                  onPress={() => router.push({ pathname: '/union/users/[id]', params: { id: entry.user.id } })}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.person, pressedStyle(pressed)]}
                >
                  <ChatAvatar
                    id={entry.user.id}
                    name={entry.user.name}
                    uri={entry.user.photos[0]?.thumbUrl ?? entry.user.avatarUrl}
                    size={44}
                  />
                  <View style={styles.personText}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
                      {entry.user.name}
                    </Text>
                    <Text style={[styles.meta, { color: colors.text1 }]}>{placeLine(entry.user)}</Text>
                  </View>
                </Pressable>
                <UnionButton
                  kind="secondary"
                  label="Вернуть"
                  accessibilityLabel={`Вернуть ${entry.user.name} в выдачу`}
                  busy={busyId === entry.user.id}
                  disabled={busyId !== null}
                  onPress={() =>
                    void run(entry.user.id, () => unionApi.unarchive(entry.user.id), 'Не удалось вернуть анкету.')
                  }
                />
              </View>
            ))
          )
        ) : hidden.blocked.length === 0 ? (
          <UnionEmpty text="Заблокированных нет. Блокировка действует на всём портале, а не только в Знакомствах." />
        ) : (
          hidden.blocked.map((person) => (
            <View key={person.userId} style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              <View style={styles.person}>
                <ChatAvatar id={person.userId} name={person.name} uri={null} size={44} />
                <Text numberOfLines={1} style={[styles.name, styles.personText, { color: colors.text0 }]}>
                  {person.name}
                </Text>
              </View>
              <UnionButton
                kind="secondary"
                label="Разблокировать"
                accessibilityLabel={`Разблокировать ${person.name}`}
                busy={busyId === person.userId}
                disabled={busyId !== null}
                onPress={() => void run(person.userId, () => unionApi.unblock(person.userId), 'Не удалось разблокировать.')}
              />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, paddingHorizontal: 16 },
  padded: { paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderRadius: radius.md, padding: 4, gap: 4 },
  tab: {
    flex: 1,
    minHeight: hitTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  tabText: { fontFamily: fonts.bodySemiBold, fontSize: 13, textAlign: 'center' },
  row: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: hitTarget, borderRadius: radius.sm, overflow: 'hidden' },
  personText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
});
