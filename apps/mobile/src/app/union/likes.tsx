import type { UnionConnectionRequestDto, UnionConnectionRequestsState } from '@vedamatch/shared';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { FlameIcon, StarIcon } from '@/components/union/union-icons';
import { UnionNav } from '@/components/union/union-nav';
import { PhotoShade, UnionPhoto } from '@/components/union/union-photo';
import {
  UnionButton,
  UnionEmpty,
  UnionLoadFailed,
  UnionLoading,
  unionHeaderOptions,
} from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { VerifiedDot } from '@/components/verified-badge';
import { confirmTap } from '@/lib/feedback';
import { describeUnionError } from '@/lib/union/union-error';
import { yearsSuffix } from '@/lib/union/union-labels';
import { pendingLikes, toggleFavorite } from '@/lib/union/union-lists';
import { VERIFICATION_BADGE_LABELS } from '@/lib/people/verification';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts, hitTarget } from '@/theme/tokens';

/**
 * Лайки — те, кто уже проявил интерес и ждёт ответа (`/union/likes` на
 * сайте). Отмеченные звёздочкой идут первыми, дальше суперлайки, дальше
 * свежие (`union-lists.ts`). Звёздочка — личная отметка, отмеченный о ней
 * не узнает.
 */
export default function UnionLikesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unionApi = useUnionApi();
  const [requests, setRequests] = useState<UnionConnectionRequestsState | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      setLoadError(null);
      try {
        const [state, favs] = await Promise.all([
          unionApi.connectionRequests(),
          unionApi.favorites().catch(() => ({ userIds: [] as string[] })),
        ]);
        setRequests(state);
        setFavorites(new Set(favs.userIds));
      } catch (e) {
        setLoadError(describeUnionError(e, 'Не удалось загрузить лайки.'));
      } finally {
        setRefreshing(false);
      }
    },
    [unionApi],
  );

  // Перечитываем при каждом возвращении: ответили на заявку в анкете —
  // карточки здесь уже не должно быть.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const likes = useMemo(() => (requests ? pendingLikes(requests, favorites) : null), [requests, favorites]);

  const respond = useCallback(
    async (request: UnionConnectionRequestDto, action: 'accept' | 'decline') => {
      if (pendingId) return;
      if (action === 'accept') confirmTap();
      setPendingId(request.id);
      setActionError(null);
      try {
        await unionApi.respond(request.id, action);
        await load();
      } catch (e) {
        setActionError(describeUnionError(e, 'Не удалось ответить.'));
      } finally {
        setPendingId(null);
      }
    },
    [load, pendingId, unionApi],
  );

  /** Звёздочка загорается сразу и гаснет обратно, если сервер отказал. */
  const star = useCallback(
    async (userId: string) => {
      const wasFavorite = favorites.has(userId);
      setFavorites((current) => toggleFavorite(current, userId));
      try {
        await unionApi.setFavorite(userId, !wasFavorite);
      } catch {
        setFavorites((current) => toggleFavorite(current, userId));
        setActionError('Не удалось изменить избранное.');
      }
    },
    [favorites, unionApi],
  );

  const renderItem = useCallback<ListRenderItem<UnionConnectionRequestDto>>(
    ({ item }) => (
      <LikeCard
        like={item}
        favorite={favorites.has(item.user.id)}
        busy={pendingId === item.id}
        disabled={pendingId !== null}
        onStar={() => void star(item.user.id)}
        onRespond={(action) => void respond(item, action)}
      />
    ),
    [favorites, pendingId, respond, star],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, 'Лайки')} />
      {!likes ? (
        <>
          <UnionNav active="likes" incomingPending={0} />
          {loadError ? (
            <UnionLoadFailed message={loadError} onRetry={() => void load()} />
          ) : (
            <UnionLoading label="Загружаем лайки" />
          )}
        </>
      ) : (
        <FlatList
          data={likes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            <View style={styles.header}>
              <UnionNav active="likes" incomingPending={likes.length} />
              <Text style={[styles.lead, { color: colors.text1 }]}>
                Люди, которые уже проявили интерес и ждут вашего ответа.
              </Text>
              {actionError ? (
                <View style={styles.padded}>
                  <InlineError message={actionError} />
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <UnionEmpty text="Пока никто не проявил интерес. Заполните анкету подробнее и посмотрите новые анкеты — так вас увидит больше людей.">
              <UnionButton kind="secondary" label="К анкетам" onPress={() => router.replace('/union/recommendations')} />
            </UnionEmpty>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 12 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.magenta}
              colors={[colors.magenta]}
            />
          }
        />
      )}
    </View>
  );
}

function LikeCard({
  like,
  favorite,
  busy,
  disabled,
  onStar,
  onRespond,
}: {
  like: UnionConnectionRequestDto;
  favorite: boolean;
  busy: boolean;
  disabled: boolean;
  onStar(): void;
  onRespond(action: 'accept' | 'decline'): void;
}) {
  const { colors } = useTheme();
  const { user } = like;
  // Карточка в списке, а не снимок во весь экран: хватает уменьшенной копии.
  const photo = user.photos[0]?.thumbUrl ?? user.photos[0]?.url ?? user.avatarUrl;
  const subtitle = [user.age != null ? `${user.age} ${yearsSuffix(user.age)}` : null, user.city].filter(Boolean).join(' · ') || '—';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.glass, borderColor: like.isSuperlike ? colors.violet : colors.glassBorder },
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${user.name}${like.isSuperlike ? ', суперлайк' : ''}. Открыть анкету`}
        onPress={() => router.push({ pathname: '/union/users/[id]', params: { id: user.id } })}
        android_ripple={ripple(dark.glassBorder)}
        style={({ pressed }) => [styles.cover, { backgroundColor: colors.bg2 }, pressedStyle(pressed)]}
      >
        <UnionPhoto uri={photo} name={user.name} initialSize={56} />
        <PhotoShade height="50%" />
        {like.isSuperlike ? (
          <View style={[styles.superlike, { backgroundColor: dark.bg1 }]}>
            <FlameIcon color={dark.gold} size={14} />
            <Text style={[styles.superlikeText, { color: dark.text0 }]}>Суперлайк</Text>
          </View>
        ) : null}
        <View style={styles.coverName}>
          <Text numberOfLines={1} style={[styles.name, { color: dark.text0 }]}>
            {user.name}
          </Text>
          {user.isVerifiedDevotee ? <VerifiedDot label={VERIFICATION_BADGE_LABELS.devotee} /> : null}
        </View>
      </Pressable>

      {/* Вне ссылки на анкету: иначе тап по звёздочке открывал бы её. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? 'Убрать из избранного' : 'Отметить как особенно понравившегося'}
        accessibilityState={{ selected: favorite }}
        onPress={onStar}
        android_ripple={ripple(dark.glassBorder, true)}
        style={({ pressed }) => [styles.star, { backgroundColor: dark.scrim }, pressedStyle(pressed)]}
      >
        <StarIcon color={favorite ? dark.gold : dark.text0} filled={favorite} />
      </Pressable>

      <View style={styles.cardBody}>
        <Text style={[styles.subtitle, { color: colors.text1 }]}>{subtitle}</Text>
        {like.message ? (
          <Text numberOfLines={3} style={[styles.message, { color: colors.text1 }]}>
            «{like.message}»
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <UnionButton grow kind="secondary" label="Пропустить" disabled={disabled} onPress={() => onRespond('decline')} />
          <UnionButton
            grow
            label="Ответить взаимностью"
            busy={busy}
            disabled={disabled && !busy}
            onPress={() => onRespond('accept')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: 4, paddingBottom: 4 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, paddingHorizontal: 16 },
  padded: { paddingHorizontal: 16, paddingTop: 8 },
  card: { marginHorizontal: 16, borderWidth: 1, borderRadius: 24, overflow: 'hidden' },
  cover: { height: 220, overflow: 'hidden' },
  superlike: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  superlikeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  coverName: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontFamily: fonts.displayBold, fontSize: 18 },
  star: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardBody: { padding: 14, gap: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 14 },
  message: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 10 },
});
