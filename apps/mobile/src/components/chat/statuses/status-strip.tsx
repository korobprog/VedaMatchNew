import type { ChatStatusFeedResponse } from '@vedamatch/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { StatusApi } from '@/lib/chat/status-api';
import { ringOf, statusA11yLabel } from '@/lib/chat/statuses/status-playback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';
import { ChatAvatar } from '../chat-avatar';
import { StatusComposer } from './status-composer';
import { useStatusViewer } from './use-status-viewer';

const AVATAR = 56;
/** Плюс поверх своей аватарки; палец ловится `hitSlop` до 44. */
const PLUS = 24;

/**
 * Полоса статусов над списком бесед (VED-129), как на сайте и в WhatsApp:
 * первым — «Мой статус» с зелёным плюсом, дальше люди со статусами,
 * непросмотренные впереди (порядок решает сервер). Нажатие открывает
 * просмотр; своя аватарка без статусов — окно публикации.
 */
export function StatusStrip({
  statusApi,
  me,
  reloadKey,
  onChanged,
}: {
  statusApi: StatusApi;
  me: { id: string; name: string; avatarUrl: string | null };
  /** Сменился — перечитать ленту (потянули список вниз, что-то посмотрели). */
  reloadKey: number;
  onChanged(): void;
}) {
  const { colors } = useTheme();
  const [feed, setFeed] = useState<ChatStatusFeedResponse | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    statusApi
      .feed()
      .then(setFeed)
      // Лента — не главное на экране: без неё остаётся «Мой статус», а
      // баннер ошибки над беседами ради неё незачем.
      .catch(() => setFeed((current) => current ?? { mine: null, others: [] }));
  }, [statusApi]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (reloadKey > 0) load();
  }, [reloadKey, load]);

  const { open, viewer } = useStatusViewer({ statusApi, viewerId: me.id, onChanged });

  const mine = feed?.mine ?? null;
  const others = feed?.others ?? [];

  return (
    <View accessibilityLabel="Статусы" style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
        <View style={styles.item}>
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mine ? 'Мой статус: посмотреть' : 'Добавить статус'}
              onPress={() => (mine ? open([mine]) : setComposing(true))}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [styles.avatarButton, pressedStyle(pressed)]}
            >
              <ChatAvatar id={me.id} name={me.name} uri={me.avatarUrl} size={AVATAR} ring={ringOf(mine, true)} round />
            </Pressable>
            {/* Плюс — всегда: ещё один статус можно добавить и поверх живых. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Новый статус"
              onPress={() => setComposing(true)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.plus,
                { backgroundColor: colors.cyan, borderColor: colors.bg0 },
                pressedStyle(pressed),
              ]}
            >
              <Svg width={12} height={12} viewBox="0 0 24 24">
                <Path d="M12 4v16M4 12h16" stroke={colors.bg0} strokeWidth={4} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          <Text numberOfLines={1} style={[styles.label, { color: colors.text1 }]}>
            Мой статус
          </Text>
        </View>

        {others.map((author, index) => (
          <View key={author.user.id} style={styles.item}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={statusA11yLabel(author.user.name, author.unseen)}
              onPress={() => open(others, index)}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [styles.avatarButton, pressedStyle(pressed)]}
            >
              <ChatAvatar
                id={author.user.id}
                name={author.user.name}
                uri={author.user.avatarUrl}
                size={AVATAR}
                ring={ringOf(author)}
                round
              />
            </Pressable>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: author.unseen > 0 ? colors.text0 : colors.text1 }]}
            >
              {author.user.name}
            </Text>
          </View>
        ))}
      </ScrollView>

      {viewer}
      {composing ? (
        <StatusComposer
          statusApi={statusApi}
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            // Экран поднимет `reloadKey` — лента перечитается вместе с кружками.
            onChanged();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -20, marginTop: 4 },
  list: { paddingHorizontal: 20, paddingVertical: 8, gap: 14 },
  item: { width: 68, alignItems: 'center', gap: 6 },
  avatarButton: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: PLUS,
    height: PLUS,
    borderRadius: PLUS / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { width: '100%', textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 12 },
});
