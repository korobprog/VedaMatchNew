import type { UnionRecommendation } from '@vedamatch/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PhotoVerifiedBadge, VerifiedBadge } from '@/components/verified-badge';
import { exitOffset, stampOpacity, swipeDirection, tiltDegrees, type SwipeDirection } from '@/lib/union/union-gestures';
import { INTENTION_LABELS, STAGE_LABELS, nameWithAge } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import { ProfileDetails } from './compatibility';
import { PhotoCarousel } from './photo-carousel';
import { ActivityLine, DecisionPill, FactPill } from './union-badges';
import { ChevronIcon, HomeIcon, LotusIcon, RulerIcon } from './union-icons';
import { PhotoShade, UnionPhoto } from './union-photo';

/** Решение, которое карточке велели исполнить кнопкой: `nonce` отличает два одинаковых подряд. */
export interface CardCommand {
  direction: SwipeDirection;
  /** Чья карточка: команда, пережившая смену анкеты, чужую не уронит. */
  userId: string;
  nonce: number;
}

/** Пружина возврата недоброшенной карточки: рука отпускает — карточка догоняет. */
const SPRING = { stiffness: 260, damping: 26 } as const;
const EXIT = { duration: 380, easing: Easing.bezier(0.22, 0.61, 0.36, 1) } as const;

/**
 * Карточка колоды: фото во всю площадь, поверх — имя, факты и интересы.
 * Тянется пальцем: вправо — познакомиться, влево — пропустить, вверх —
 * суперлайк (`swipe-deck.tsx` сайта, `SwipeCard`).
 *
 * Всё движение — на потоке интерфейса: смещение пальца пишется прямо в
 * общие значения Reanimated, React в это время не перерисовывает ничего.
 * В JS уходит только итог — одно решение, когда карточка уже улетела.
 *
 * Кнопки решений исполняют то же движение, что палец: решение выглядит
 * одинаково, чем бы его ни приняли. «Уменьшить движение» — вместо полёта
 * карточка гаснет на месте.
 */
export function SwipeCard({
  item,
  width,
  height,
  reduceMotion,
  expanded,
  onExpandedChange,
  command,
  onSwiped,
  onTouchingChange,
  onTapPhoto,
}: {
  item: UnionRecommendation;
  width: number;
  height: number;
  reduceMotion: boolean;
  /** Раскрытие держит колода: от него зависят и её стрелки листания. */
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  command: CardCommand | null;
  onSwiped(direction: SwipeDirection): void;
  onTouchingChange(touching: boolean): void;
  onTapPhoto(): void;
}) {
  const { user, profile } = item;
  // Индекс снимка — здесь, а не в карусели: миниатюры в раскрытой анкете
  // листают ту же обложку, а не заводят вторую.
  const [photoIndex, setPhotoIndex] = useState(0);
  const [touching, setTouching] = useState(false);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(reduceMotion ? 1 : 0.94);
  const flying = useSharedValue(false);

  // Приходит снизу из стопки на место ушедшей.
  useEffect(() => {
    opacity.set(withTiming(1, { duration: reduceMotion ? 150 : 220 }));
    if (!reduceMotion) scale.set(withSpring(1, SPRING));
  }, [opacity, reduceMotion, scale]);

  const finish = (direction: SwipeDirection) => onSwiped(direction);

  function fly(direction: SwipeDirection) {
    'worklet';
    if (flying.get()) return;
    flying.set(true);
    if (reduceMotion) {
      opacity.set(
        withTiming(0, { duration: 150 }, (done) => {
          if (done) scheduleOnRN(finish, direction);
        }),
      );
      return;
    }
    const target = exitOffset(direction, width, height);
    ty.set(withTiming(target.y, EXIT));
    tx.set(
      withTiming(target.x, EXIT, (done) => {
        if (done) scheduleOnRN(finish, direction);
      }),
    );
  }

  // Кнопка внизу велела принять решение — то же движение, что у пальца.
  useEffect(() => {
    if (command && command.userId === user.id) fly(command.direction);
    // `fly` — функция-ворклет этого же рендера; перезапускать эффект нужно
    // только по новой команде.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  const setTouch = (value: boolean) => {
    setTouching(value);
    onTouchingChange(value);
  };

  const pan = Gesture.Pan()
    // В раскрытой анкете палец прокручивает детали, а не тащит карточку.
    .enabled(!expanded)
    // Порог — чтобы тап по фото и по кнопкам поверх него оставался тапом.
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onBegin(() => {
      scheduleOnRN(setTouch, true);
    })
    .onUpdate((event) => {
      if (flying.get()) return;
      tx.set(event.translationX);
      ty.set(event.translationY);
    })
    .onEnd((event) => {
      const direction = swipeDirection(
        { x: event.translationX, y: event.translationY },
        { x: event.velocityX, y: event.velocityY },
      );
      if (direction) {
        fly(direction);
      } else {
        tx.set(withSpring(0, SPRING));
        ty.set(withSpring(0, SPRING));
      }
    })
    .onFinalize(() => {
      scheduleOnRN(setTouch, false);
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      { rotate: `${tiltDegrees(tx.get())}deg` },
      { scale: scale.get() },
    ],
  }));
  const likeStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(tx.get()) }));
  const skipStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(-tx.get()) }));
  const superStamp = useAnimatedStyle(() => ({ opacity: stampOpacity(-ty.get()) }));

  const hasFacts = Boolean(user.city) || profile.heightCm != null || Boolean(user.spiritualStage);
  const openProfile = () => router.push({ pathname: '/union/users/[id]', params: { id: user.id } });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, { backgroundColor: dark.bg2, borderColor: dark.glassBorder }, cardStyle]}>
        <PhotoCarousel
          photos={user.photos}
          avatarUrl={user.avatarUrl}
          name={user.name}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          // Палец на карточке и раскрытая анкета — пауза автолистания: иначе
          // снимок прыгал бы ровно тогда, когда карточку тянут.
          paused={touching || expanded}
          onTapPhoto={onTapPhoto}
        />

        {/* Штампы решения проявляются по мере того, как карточку тянут. */}
        <Animated.Text
          importantForAccessibility="no"
          style={[styles.stamp, styles.stampLeft, { color: dark.cyan, borderColor: dark.cyan }, likeStamp]}
        >
          ЗНАКОМИМСЯ
        </Animated.Text>
        <Animated.Text
          importantForAccessibility="no"
          style={[styles.stamp, styles.stampRight, { color: dark.text0, borderColor: dark.text0 }, skipStamp]}
        >
          ПРОПУСК
        </Animated.Text>
        <Animated.Text importantForAccessibility="no" style={[styles.stampTop, { color: dark.violet }, superStamp]}>
          СУПЕРЛАЙК
        </Animated.Text>

        <PhotoShade />

        {/* Панель решений занимает низ колоды; над ней — воздух, иначе
            пилюли интересов читались как её продолжение. */}
        <View pointerEvents="box-none" style={styles.info}>
          <View pointerEvents="none" style={styles.row}>
            <ActivityLine activity={user.activity} lastSeenAt={user.lastSeenAt} tone="overlay" />
            {/* В режиме «показать всех» отсмотренные возвращаются в колоду —
                карточка обязана сказать, что решение по ней уже принято. */}
            <DecisionPill decision={item.myDecision} tone="overlay" />
          </View>

          <View pointerEvents="box-none" style={styles.nameRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${nameWithAge(user)}. Открыть анкету`}
              onPress={openProfile}
              hitSlop={8}
              style={styles.nameButton}
            >
              <Text numberOfLines={1} style={[styles.name, { color: dark.text0 }]}>
                {nameWithAge(user)}
              </Text>
            </Pressable>
            {/* Только подтверждённым: непройденная проверка — не свойство
                человека, а отсутствие события, клеймить им несправедливо. */}
            {user.isVerifiedDevotee ? <VerifiedBadge variant="dot" /> : null}
            {user.isPhotoVerified ? <PhotoVerifiedBadge variant="dot" /> : null}
            <View style={styles.spacer} />
            {!expanded ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Развернуть анкету"
                accessibilityState={{ expanded: false }}
                onPress={() => onExpandedChange(true)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.round, { backgroundColor: dark.scrim }, pressedStyle(pressed)]}
              >
                <ChevronIcon direction="up" color={dark.text0} />
              </Pressable>
            ) : null}
          </View>

          {hasFacts ? (
            <View pointerEvents="none" style={styles.row}>
              {user.city ? <FactPill icon={<HomeIcon color={dark.text1} />}>{user.city}</FactPill> : null}
              {profile.heightCm != null ? (
                <FactPill icon={<RulerIcon color={dark.text1} />}>{`${profile.heightCm} см`}</FactPill>
              ) : null}
              {user.spiritualStage ? (
                <FactPill icon={<LotusIcon color={dark.text1} />}>{STAGE_LABELS[user.spiritualStage]}</FactPill>
              ) : null}
            </View>
          ) : null}

          {profile.interests.length > 0 && !expanded ? (
            <View pointerEvents="none" style={styles.row} accessible accessibilityLabel={`Интересы: ${profile.interests.join(', ')}`}>
              {profile.interests.slice(0, 3).map((interest) => (
                <FactPill key={interest}>{interest}</FactPill>
              ))}
              {profile.interests.length > 3 ? <FactPill>{`+${profile.interests.length - 3}`}</FactPill> : null}
            </View>
          ) : null}
        </View>

        {expanded ? (
          /* Детали ложатся поверх фото, а не отдельной панелью под ним:
             панель отрезала бы кусок карточки, фото сжималось бы. */
          <View style={[styles.expanded, { backgroundColor: dark.bg1 }]}>
            <View style={styles.expandedHead}>
              <Text accessibilityRole="header" style={[styles.expandedName, { color: dark.text0 }]}>
                {nameWithAge(user)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Свернуть анкету"
                accessibilityState={{ expanded: true }}
                onPress={() => onExpandedChange(false)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.round, { backgroundColor: dark.bg2 }, pressedStyle(pressed)]}
              >
                <ChevronIcon direction="down" color={dark.text0} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.expandedBody}>
              {user.photos.length > 1 ? (
                /* Все снимки разом: обложка листается по одному, а здесь видно
                   и сколько их, и какой сейчас. Миниатюра — уменьшенная копия. */
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
                  {user.photos.map((photo, index) => (
                    <Pressable
                      key={photo.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Фото ${index + 1}`}
                      accessibilityState={{ selected: index === photoIndex }}
                      onPress={() => setPhotoIndex(index)}
                      style={[
                        styles.thumb,
                        { borderColor: index === photoIndex ? dark.text0 : dark.bg1, opacity: index === photoIndex ? 1 : 0.7 },
                      ]}
                    >
                      <UnionPhoto uri={photo.thumbUrl ?? photo.url} name={user.name} initialSize={16} />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              {profile.intentions.length > 0 ? (
                <View style={styles.row}>
                  {profile.intentions.slice(0, 3).map((intention) => (
                    <FactPill key={intention.type}>{`${INTENTION_LABELS[intention.type]} ${intention.weight}%`}</FactPill>
                  ))}
                </View>
              ) : null}
              {profile.status ? <Text style={[styles.status, { color: dark.text0 }]}>«{profile.status}»</Text> : null}
              {profile.about ? <Text style={[styles.about, { color: dark.text0 }]}>{profile.about}</Text> : null}
              {profile.interests.length > 0 ? (
                <View style={styles.row}>
                  {profile.interests.map((interest) => (
                    <FactPill key={interest}>{interest}</FactPill>
                  ))}
                </View>
              ) : null}
              <ProfileDetails details={profile} tone="overlay" />
              <Pressable
                accessibilityRole="link"
                onPress={openProfile}
                android_ripple={ripple(dark.glassBorder)}
                style={({ pressed }) => [styles.more, { borderColor: dark.sheetBorder }, pressedStyle(pressed)]}
              >
                <Text style={[styles.moreText, { color: dark.text0 }]}>Вся анкета</Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Следующая анкета под текущей: только обложка, без каруселей и кнопок.
 * Без неё решение открывало бы пустоту, и колода на миг выглядела
 * закончившейся.
 */
export function StackPreview({ item }: { item: UnionRecommendation }) {
  const { user } = item;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
      style={[styles.card, styles.preview, { backgroundColor: dark.bg2, borderColor: dark.glassBorder }]}
    >
      <UnionPhoto uri={user.photos[0]?.url ?? user.avatarUrl} name={user.name} initialSize={96} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark.scrim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: { transform: [{ scale: 0.94 }, { translateY: 14 }] },
  stamp: {
    position: 'absolute',
    top: 72,
    borderWidth: 2,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontFamily: fonts.displayBold,
    fontSize: 18,
  },
  stampLeft: { left: 16, transform: [{ rotate: '-12deg' }] },
  stampRight: { right: 16, transform: [{ rotate: '12deg' }] },
  stampTop: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.displayBold,
    fontSize: 18,
  },
  // Низ отдан панели решений колоды (≈ 96 dp), над ней — 16 dp воздуха.
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 112, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameButton: { flexShrink: 1, minHeight: hitTarget, justifyContent: 'center' },
  name: { fontFamily: fonts.displayBold, fontSize: 22 },
  spacer: { flex: 1 },
  round: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  expanded: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 104,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  expandedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  expandedName: { flex: 1, fontFamily: fonts.displayBold, fontSize: 18 },
  expandedBody: { gap: 10, paddingTop: 8, paddingBottom: 8 },
  thumbs: { gap: 8 },
  thumb: { width: hitTarget + 4, height: 64, borderRadius: 10, borderWidth: 2, overflow: 'hidden' },
  status: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  about: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  more: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
  moreText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
