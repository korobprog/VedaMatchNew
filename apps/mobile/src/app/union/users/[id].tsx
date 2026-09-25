import type { UnionRecommendation } from '@vedamatch/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InlineError } from '@/components/inline-error';
import { PeopleDetails } from '@/components/people/people-details';
import { CompatibilityBreakdown, ProfileDetails } from '@/components/union/compatibility';
import { PhotoCarousel } from '@/components/union/photo-carousel';
import { ActivityLine, DecisionPill } from '@/components/union/union-badges';
import { ChevronIcon } from '@/components/union/union-icons';
import { PhotoShade } from '@/components/union/union-photo';
import {
  UnionButton,
  UnionLoadFailed,
  UnionLoading,
  unionHeaderOptions,
} from '@/components/union/union-screen-parts';
import { useUnionApi } from '@/components/union/use-union';
import { PhotoVerifiedBadge, VerifiedBadge } from '@/components/verified-badge';
import { useSession } from '@/lib/auth/session';
import { createChatApi } from '@/lib/chat/chat-api';
import { confirmTap } from '@/lib/feedback';
import { describeUnionError, isNotFound } from '@/lib/union/union-error';
import { INTENTION_LABELS, nameWithAge, profileSubtitle } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Анкета человека в Знакомствах (`/union/users/[id]` на сайте,
 * `recommendation-card.tsx`): фото, цели, «о себе», совместимость с разбором
 * и то, что можно сделать — познакомиться, ответить на заявку, написать,
 * пожаловаться или заблокировать.
 *
 * «Написать» ведёт в «Чаты» приложения: переписка на портале одна, у
 * Знакомств своего чата нет с тех пор, как его перенесли в «Общение».
 */
export default function UnionUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, user: me } = useSession();
  const unionApi = useUnionApi();
  const chatApi = useMemo(() => createChatApi(api), [api]);

  const [card, setCard] = useState<UnionRecommendation | null>(null);
  const [gone, setGone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'accept' | 'decline' | 'write' | 'block' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockAsk, setBlockAsk] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCard(await unionApi.userCard(userId));
      setGone(false);
    } catch (e) {
      // Скрыл анкету, заблокировал нас или анкеты нет вовсе — сервер
      // отвечает одинаково, и причину мы не называем: это чужое решение.
      if (isNotFound(e)) setGone(true);
      else setLoadError(describeUnionError(e, 'Не удалось открыть анкету.'));
    }
  }, [unionApi, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<unknown>, fallback: string) => {
    if (busy) return false;
    setBusy(kind);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setActionError(describeUnionError(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    confirmTap();
    if (await run('connect', () => unionApi.createConnection({ toUserId: userId }), 'Не удалось отправить запрос.')) void load();
  };
  const respond = async (action: 'accept' | 'decline') => {
    if (!card?.connection) return;
    const requestId = card.connection.id;
    if (action === 'accept') confirmTap();
    if (await run(action, () => unionApi.respond(requestId, action), 'Не удалось ответить на заявку.')) void load();
  };
  const write = async () => {
    confirmTap();
    let conversationId: string | null = null;
    const ok = await run(
      'write',
      async () => {
        conversationId = (await chatApi.createDirect(userId)).id;
      },
      'Не удалось открыть переписку.',
    );
    if (ok && conversationId) router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
  };
  const block = async () => {
    const ok = await run('block', () => unionApi.block(userId), 'Не удалось заблокировать.');
    setBlockAsk(false);
    if (ok) {
      // Заблокированный пропадает из выдачи и из лайков — на его анкете
      // больше делать нечего.
      if (router.canGoBack()) router.back();
      else router.replace('/union/recommendations');
    }
  };

  if (gone) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        <Stack.Screen options={unionHeaderOptions(colors, 'Анкета')} />
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.text1 }]}>
            Анкета недоступна: человек скрыл её или она больше не участвует в Знакомствах.
          </Text>
          <UnionButton kind="secondary" label="К анкетам" onPress={() => router.replace('/union/recommendations')} />
        </View>
      </View>
    );
  }

  if (!card) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        <Stack.Screen options={unionHeaderOptions(colors, 'Анкета')} />
        {loadError ? <UnionLoadFailed message={loadError} onRetry={() => void load()} /> : <UnionLoading label="Загружаем анкету" />}
      </View>
    );
  }

  const { user: person, profile, compatibility, connection } = card;
  const isSelf = me?.id === person.id;
  const photoHeight = Math.round(width * 1.25);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={unionHeaderOptions(colors, person.name)} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.photo, { height: photoHeight, backgroundColor: colors.bg2 }]}>
          <PhotoCarousel
            photos={person.photos}
            avatarUrl={person.avatarUrl}
            name={person.name}
            index={photoIndex}
            onIndexChange={setPhotoIndex}
          />
          <PhotoShade height="40%" />
          <View pointerEvents="none" style={styles.photoTop}>
            <View style={styles.pills}>
              <ActivityLine activity={person.activity} lastSeenAt={person.lastSeenAt} tone="overlay" />
              <DecisionPill decision={card.myDecision} tone="overlay" />
            </View>
            {!isSelf ? (
              <Text style={[styles.percent, { color: dark.onAccent, backgroundColor: dark.magenta }]}>
                {`${compatibility.total}%`}
              </Text>
            ) : null}
          </View>
          <View pointerEvents="none" style={styles.photoBottom}>
            <View style={styles.nameRow}>
              <Text accessibilityRole="header" numberOfLines={2} style={[styles.name, { color: dark.text0 }]}>
                {nameWithAge(person)}
              </Text>
              {person.isVerifiedDevotee ? <VerifiedBadge variant="dot" /> : null}
              {person.isPhotoVerified ? <PhotoVerifiedBadge variant="dot" /> : null}
            </View>
            <Text style={[styles.subtitle, { color: dark.text0 }]}>{profileSubtitle(person)}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {person.isVerifiedDevotee || person.isPhotoVerified ? (
            <View style={styles.pills}>
              {person.isVerifiedDevotee ? <VerifiedBadge variant="inline" /> : null}
              {person.isPhotoVerified ? <PhotoVerifiedBadge variant="inline" /> : null}
            </View>
          ) : null}

          {profile.intentions.length > 0 ? (
            <View style={styles.pills}>
              {profile.intentions.map((intention) => (
                <View key={intention.type} style={[styles.chip, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
                  <Text style={[styles.chipText, { color: colors.text1 }]}>
                    {INTENTION_LABELS[intention.type]} {intention.weight}%
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {profile.status ? <Text style={[styles.status, { color: colors.text0 }]}>«{profile.status}»</Text> : null}

          {profile.about ? (
            <View style={styles.section}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
                О себе
              </Text>
              <Text selectable style={[styles.text, { color: colors.text1 }]}>
                {profile.about}
              </Text>
            </View>
          ) : null}

          {profile.interests.length > 0 ? (
            <TagSection title="Интересы" tags={profile.interests} />
          ) : null}
          {profile.values.length > 0 ? <TagSection title="Ценности" tags={profile.values} /> : null}
          {profile.skills.length > 0 ? <TagSection title="Навыки" tags={profile.skills} /> : null}
          {profile.languages.length > 0 ? <TagSection title="Языки" tags={profile.languages} /> : null}

          <ProfileDetails details={profile} tone="plain" />

          {person.contacts ? (
            <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
                Контакты
              </Text>
              <PeopleDetails contacts={person.contacts} />
            </View>
          ) : null}

          {!isSelf && compatibility.breakdown.length > 0 ? (
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: whyOpen }}
                onPress={() => setWhyOpen((value) => !value)}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.why, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
              >
                <Text style={[styles.whyText, { color: colors.text0 }]}>{`Почему ${compatibility.total}%?`}</Text>
                <ChevronIcon direction={whyOpen ? 'up' : 'down'} color={colors.text1} />
              </Pressable>
              {whyOpen ? <CompatibilityBreakdown compatibility={compatibility} tone="plain" /> : null}
            </View>
          ) : null}

          {isSelf ? (
            <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
                Это ваша анкета
              </Text>
              <Text style={[styles.text, { color: colors.text1 }]}>Так её видят другие участники Знакомств.</Text>
            </View>
          ) : (
            <View style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
              {connection?.status === 'accepted' ? (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text0 }]}>Знакомство взаимно — можно писать.</Text>
                  <UnionButton
                    label="Написать"
                    accessibilityLabel={`Написать ${person.name}`}
                    busy={busy === 'write'}
                    onPress={() => void write()}
                  />
                </>
              ) : connection?.status === 'pending' && connection.direction === 'outgoing' ? (
                <Text style={[styles.text, { color: colors.text1 }]}>
                  Запрос на знакомство отправлен. Как только человек ответит взаимностью, откроется переписка.
                </Text>
              ) : connection?.status === 'pending' && connection.direction === 'incoming' ? (
                <>
                  <Text style={[styles.sectionTitle, { color: colors.text0 }]}>
                    {connection.isSuperlike ? 'Вам суперлайк!' : 'Хочет познакомиться с вами'}
                  </Text>
                  {connection.message ? (
                    <Text style={[styles.text, { color: colors.text1 }]}>«{connection.message}»</Text>
                  ) : null}
                  <View style={styles.buttons}>
                    <UnionButton
                      grow
                      kind="secondary"
                      label="Отклонить"
                      busy={busy === 'decline'}
                      disabled={busy !== null}
                      onPress={() => void respond('decline')}
                    />
                    <UnionButton
                      grow
                      label="Принять"
                      busy={busy === 'accept'}
                      disabled={busy !== null}
                      onPress={() => void respond('accept')}
                    />
                  </View>
                </>
              ) : (
                <UnionButton label="Познакомиться" busy={busy === 'connect'} onPress={() => void connect()} />
              )}
              {actionError ? <InlineError message={actionError} /> : null}
            </View>
          )}

          {!isSelf ? (
            <View style={styles.safety}>
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({ pathname: '/union/report/[id]', params: { id: person.id, name: person.name } })
                }
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.safetyButton, pressedStyle(pressed)]}
              >
                <Text style={[styles.safetyText, { color: colors.text1 }]}>Пожаловаться</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setBlockAsk(true)}
                android_ripple={ripple(colors.glassBorder)}
                style={({ pressed }) => [styles.safetyButton, pressedStyle(pressed)]}
              >
                <Text style={[styles.safetyText, { color: colors.text1 }]}>Заблокировать</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={blockAsk}
        title={`Заблокировать ${person.name}?`}
        message="Вы больше не увидите друг друга в Знакомствах, а заявки и лайки между вами пропадут. Снять блокировку можно в разделе «Скрытые»."
        confirmLabel="Заблокировать"
        destructive
        busy={busy === 'block'}
        onConfirm={() => void block()}
        onCancel={() => setBlockAsk(false)}
      />
    </View>
  );
}

function TagSection({ title, tags }: { title: string; tags: string[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text0 }]}>
        {title}
      </Text>
      <View style={styles.pills}>
        {tags.map((tag) => (
          <View key={tag} style={[styles.chip, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
            <Text style={[styles.chipText, { color: colors.text1 }]}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  centerText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  photo: { width: '100%', overflow: 'hidden' },
  photoTop: {
    position: 'absolute',
    top: 24,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  photoBottom: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 4 },
  percent: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: fonts.body, fontSize: 13 },
  status: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: 16, gap: 12 },
  buttons: { flexDirection: 'row', gap: 10 },
  why: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  whyText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  safety: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  safetyButton: { minHeight: hitTarget, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.sm, overflow: 'hidden' },
  safetyText: { fontFamily: fonts.bodySemiBold, fontSize: 14, textDecorationLine: 'underline' },
});
