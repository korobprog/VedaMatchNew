import type { UnionRecommendation, UnionSwipeDecision } from '@vedamatch/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmTap } from '@/lib/feedback';
import { deckReducer, deckView, initialDeckState, swipeResultMessage, type DeckAction } from '@/lib/union/deck-state';
import type { UnionApi } from '@/lib/union/union-api';
import { readHintSeen, rememberHintSeen } from '@/lib/union/union-device-prefs';
import { describeUnionError } from '@/lib/union/union-error';
import type { SwipeDirection } from '@/lib/union/union-gestures';
import { pressedStyle, ripple } from '@/theme/press';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import { BoostButton } from './boost-button';
import { CompatibilityBreakdown, CompatibilityRing } from './compatibility';
import { DeckToast, PhotoTapHint, SwipeHint } from './deck-overlays';
import { SwipeCard, StackPreview, type CardCommand } from './swipe-card';
import { ArchiveIcon, ChevronIcon, CloseIcon, FlameIcon, HeartIcon, UndoIcon } from './union-icons';

const DECISION_BY_DIRECTION: Record<SwipeDirection, UnionSwipeDecision> = {
  left: 'pass',
  right: 'like',
  up: 'superlike',
};

/** Когда в колоде останется столько, пора подгружать следующую порцию. */
const PREFETCH_REMAINING = 4;

/** Сколько держится подсказка «тапните по краю фото», мс. */
const PHOTO_HINT_MS = 3600;

/**
 * Колода свайпов на весь экран: одна анкета, вправо — познакомиться, влево —
 * пропустить, вверх — суперлайк (`swipe-deck.tsx` сайта). Каждое решение
 * уходит на сервер, поэтому отсмотренные не возвращаются в колоду после
 * перезапуска.
 *
 * Полноэкранный фокус-режим, как на сайте: в полосе посреди экрана карточка
 * делила место с меню, фильтрами и заголовком, и под само фото оставалась
 * треть высоты. Здесь у экрана одна задача.
 */
export function SwipeDeck({
  items,
  initialIndex,
  unionApi,
  hasMore,
  loadingMore,
  onNeedMore,
  onExit,
  onNewCycle,
  onShowEveryone,
}: {
  items: UnionRecommendation[];
  initialIndex: number;
  unionApi: UnionApi;
  /** На сервере есть ещё порции выдачи. */
  hasMore: boolean;
  loadingMore: boolean;
  onNeedMore(): void;
  onExit(): void;
  /** Круг начат заново — выдачу надо перечитать с начала. */
  onNewCycle(): void;
  /** «Показать вообще всех» — последний выход, когда дело не в круге, а в фильтрах. */
  onShowEveryone(): void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [deck, setDeck] = useState(() => initialDeckState(items, initialIndex));
  const dispatch = useCallback((action: DeckAction) => setDeck((state) => deckReducer(items, state, action)), [items]);
  const view = useMemo(() => deckView(items, deck), [items, deck]);
  const { current, next } = view;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [command, setCommand] = useState<CardCommand | null>(null);
  const nonce = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [recycling, setRecycling] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; celebrate: boolean; nonce: number } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  // Подсказки — один раз на телефон. Пока хранилище не ответило, считаем их
  // показанными: мигнуть подсказкой и тут же убрать хуже, чем показать на
  // полсекунды позже.
  const [swipeHint, setSwipeHint] = useState(false);
  const [photoHint, setPhotoHint] = useState(false);
  useEffect(() => {
    void readHintSeen('swipeHint').then((seen) => setSwipeHint(!seen));
    void readHintSeen('photoHint').then((seen) => setPhotoHint(!seen));
  }, []);
  const dismissSwipeHint = useCallback(() => {
    setSwipeHint(false);
    void rememberHintSeen('swipeHint');
  }, []);
  const dismissPhotoHint = useCallback(() => {
    setPhotoHint(false);
    void rememberHintSeen('photoHint');
  }, []);
  const showPhotoHint = photoHint && !swipeHint && !expanded && (current?.user.photos.length ?? 0) > 1;
  useEffect(() => {
    if (!showPhotoHint) return;
    const timer = setTimeout(dismissPhotoHint, PHOTO_HINT_MS);
    return () => clearTimeout(timer);
  }, [dismissPhotoHint, showPhotoHint]);

  // Колода подходит к концу — подгружаем следующую порцию заранее, чтобы
  // «Круг пройден» не мелькал, пока на сервере ещё есть люди.
  const remaining = view.visible.length - deck.cursor;
  useEffect(() => {
    if (hasMore && !loadingMore && remaining <= PREFETCH_REMAINING) onNeedMore();
  }, [hasMore, loadingMore, onNeedMore, remaining]);

  const resetCardUi = () => {
    setExpanded(false);
    // Разбор относится к конкретной анкете: оставить его над следующей
    // значило бы показать чужие проценты под новым именем.
    setBreakdownOpen(false);
  };

  /** Карточка улетела — решение принято. Сервер узнаёт о нём уже после. */
  const onSwiped = useCallback(
    (direction: SwipeDirection) => {
      const target = current;
      setCommand(null);
      resetCardUi();
      dispatch({ type: 'decide' });
      if (!target) return;
      const decision = DECISION_BY_DIRECTION[direction];
      setError(null);
      unionApi
        .swipe({ toUserId: target.user.id, decision })
        .then((result) => {
          setCanUndo(true);
          const message = swipeResultMessage(decision, result.matched);
          if (message) setToast({ message, celebrate: result.matched, nonce: Date.now() });
        })
        .catch((e) => setError(describeUnionError(e, 'Не удалось сохранить выбор.')));
    },
    [current, dispatch, unionApi],
  );

  /** Кнопка решения: то же движение, что у пальца, — карточка улетает сама. */
  const decide = (direction: SwipeDirection) => {
    if (!current || command) return;
    if (direction !== 'left') confirmTap();
    nonce.current += 1;
    setCommand({ direction, userId: current.user.id, nonce: nonce.current });
  };

  const browse = (delta: 1 | -1) => {
    resetCardUi();
    dispatch({ type: 'browse', delta });
  };

  /** Возврат последней анкеты: сервер снимает решение, колода отматывается назад. */
  const undo = async () => {
    if (undoing || !canUndo) return;
    setUndoing(true);
    setError(null);
    try {
      await unionApi.undoLastSwipe();
      setCanUndo(false);
      setToast(null);
      resetCardUi();
      dispatch({ type: 'undo' });
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось вернуть анкету.'));
    } finally {
      setUndoing(false);
    }
  };

  /**
   * «Убрать совсем» — в отличие от крестика, который прячет анкету до конца
   * круга. Уходит как решение, но откат после него выключен: сервер снимает
   * последний СВАЙП, а не архив, и откат вернул бы не того человека.
   */
  const archive = async () => {
    if (!current || archiving) return;
    setArchiving(true);
    setError(null);
    try {
      await unionApi.archive(current.user.id);
      setCanUndo(false);
      resetCardUi();
      dispatch({ type: 'decide' });
      setToast({ message: 'Убрано в архив. Вернуть можно в «Скрытых»', celebrate: false, nonce: Date.now() });
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось убрать в архив.'));
    } finally {
      setArchiving(false);
    }
  };

  const newCycle = async () => {
    if (recycling) return;
    setRecycling(true);
    setError(null);
    try {
      await unionApi.newCycle();
      setCanUndo(false);
      dispatch({ type: 'reset' });
      onNewCycle();
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось начать круг заново.'));
    } finally {
      setRecycling(false);
    }
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const topOffset = insets.top + 12;

  return (
    <View style={[styles.root, { backgroundColor: dark.bg0, paddingTop: topOffset, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.stage} onLayout={onLayout}>
        {!current ? (
          <View style={[styles.empty, { backgroundColor: dark.bg1, borderColor: dark.glassBorder }]}>
            {hasMore || loadingMore ? (
              <ActivityIndicator color={dark.magenta} accessibilityLabel="Загружаем ещё анкеты" />
            ) : (
              <>
                <Text accessibilityRole="header" style={[styles.emptyTitle, { color: dark.text0 }]}>
                  Круг пройден
                </Text>
                <Text style={[styles.emptyText, { color: dark.text1 }]}>
                  Вы посмотрели всех, кто подходит по текущим фильтрам. Можно начать круг заново — пропущенные
                  вернутся, лайки и архив останутся как есть.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: recycling, disabled: recycling }}
                  disabled={recycling}
                  onPress={() => void newCycle()}
                  android_ripple={ripple(dark.glassBorder)}
                  style={({ pressed }) => [styles.primary, { backgroundColor: dark.magenta }, recycling ? styles.busy : pressedStyle(pressed)]}
                >
                  {recycling ? (
                    <ActivityIndicator color={dark.onAccent} />
                  ) : (
                    <Text style={[styles.primaryText, { color: dark.onAccent }]}>Показать заново</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onShowEveryone}
                  android_ripple={ripple(dark.glassBorder)}
                  style={({ pressed }) => [styles.secondary, { borderColor: dark.sheetBorder }, pressedStyle(pressed)]}
                >
                  <Text style={[styles.secondaryText, { color: dark.text0 }]}>Показать вообще всех</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onExit}
                  android_ripple={ripple(dark.glassBorder)}
                  style={({ pressed }) => [styles.secondary, { borderColor: dark.sheetBorder }, pressedStyle(pressed)]}
                >
                  <Text style={[styles.secondaryText, { color: dark.text0 }]}>К списку</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <>
            {next ? <StackPreview key={`preview-${next.user.id}`} item={next} /> : null}
            {size.width > 0 ? (
              <SwipeCard
                key={current.user.id}
                item={current}
                width={size.width}
                height={size.height}
                reduceMotion={reduceMotion}
                expanded={expanded}
                onExpandedChange={setExpanded}
                command={command}
                onSwiped={onSwiped}
                onTouchingChange={() => undefined}
                onTapPhoto={() => {
                  if (showPhotoHint) dismissPhotoHint();
                }}
              />
            ) : null}
            {showPhotoHint ? <PhotoTapHint /> : null}
          </>
        )}

        {/* Верхняя полоса отдана карточке, поэтому выход, счётчик и
            «Внимание» живут поверх фото: слева — выход, по центру — счётчик. */}
        <View pointerEvents="box-none" style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть колоду"
            onPress={onExit}
            android_ripple={ripple(dark.glassBorder, true)}
            style={({ pressed }) => [styles.round, { backgroundColor: dark.scrim }, pressedStyle(pressed)]}
          >
            <CloseIcon color={dark.text0} />
          </Pressable>
          {current ? (
            <Text
              accessibilityLabel={`Анкета ${view.position} из ${view.visible.length}`}
              style={[styles.counter, { color: dark.text0, backgroundColor: dark.scrim }]}
            >
              {view.position} из {view.visible.length}
            </Text>
          ) : (
            <View />
          )}
          <BoostButton unionApi={unionApi} />
        </View>

        {current && !expanded ? (
          <>
            {/* Архив — отдельно от ряда решений: это не выбор между людьми,
                а изъятие человека из выдачи, и путать их кнопками рядом не
                стоит. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Убрать в архив"
              accessibilityHint="Анкета больше не появится. Вернуть можно в разделе «Скрытые»"
              accessibilityState={{ busy: archiving, disabled: archiving }}
              disabled={archiving}
              onPress={() => void archive()}
              android_ripple={ripple(dark.glassBorder, true)}
              style={({ pressed }) => [styles.round, styles.archive, { backgroundColor: dark.scrim }, archiving ? styles.busy : pressedStyle(pressed)]}
            >
              <ArchiveIcon color={dark.text0} />
            </Pressable>

            {/* Листание без решения: вспомогательный путь, основной — свайп. */}
            {view.canBrowseBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Предыдущая анкета"
                onPress={() => browse(-1)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.round, styles.browseLeft, { backgroundColor: dark.scrim }, pressedStyle(pressed)]}
              >
                <ChevronIcon direction="left" color={dark.text0} />
              </Pressable>
            ) : null}
            {view.canBrowseForward ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Следующая анкета"
                onPress={() => browse(1)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.round, styles.browseRight, { backgroundColor: dark.scrim }, pressedStyle(pressed)]}
              >
                <ChevronIcon direction="right" color={dark.text0} />
              </Pressable>
            ) : null}
          </>
        ) : null}

        {current ? (
          /* Панель решений неподвижна: уезжает только карточка, и рука не
             гонится за кнопками между анкетами. */
          <View style={styles.actions}>
            <ActionButton label="Пропустить" onPress={() => decide('left')}>
              <CloseIcon color={dark.text0} size={26} />
            </ActionButton>
            <ActionButton
              label="Вернуть предыдущую анкету"
              small
              disabled={!canUndo || undoing}
              busy={undoing}
              onPress={() => void undo()}
            >
              <UndoIcon color={dark.text0} />
            </ActionButton>
            <CompatibilityRing
              total={current.compatibility.total}
              expanded={breakdownOpen}
              onPress={() => setBreakdownOpen((value) => !value)}
            />
            <ActionButton label="Суперлайк" onPress={() => decide('up')}>
              <FlameIcon color={dark.gold} />
            </ActionButton>
            <ActionButton label="Познакомиться" onPress={() => decide('right')}>
              <HeartIcon color={dark.success} />
            </ActionButton>
          </View>
        ) : null}

        {current && breakdownOpen ? (
          <View style={[styles.breakdown, { backgroundColor: dark.bg1 }]}>
            <View style={styles.breakdownHead}>
              <Text accessibilityRole="header" style={[styles.breakdownTitle, { color: dark.text0 }]}>
                {`Почему ${current.compatibility.total}%`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть разбор совместимости"
                onPress={() => setBreakdownOpen(false)}
                android_ripple={ripple(dark.glassBorder, true)}
                style={({ pressed }) => [styles.round, { backgroundColor: dark.bg2 }, pressedStyle(pressed)]}
              >
                <CloseIcon color={dark.text0} />
              </Pressable>
            </View>
            <ScrollView>
              <CompatibilityBreakdown compatibility={current.compatibility} tone="overlay" />
            </ScrollView>
          </View>
        ) : null}

        {error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.error, { color: dark.text0, backgroundColor: dark.bg1, borderColor: dark.magenta }]}
          >
            {error}
          </Text>
        ) : null}

        <DeckToast
          message={toast?.message ?? null}
          nonce={toast?.nonce ?? 0}
          celebrate={toast?.celebrate ?? false}
          reduceMotion={reduceMotion}
          onDone={clearToast}
        />

        {swipeHint && current ? <SwipeHint reduceMotion={reduceMotion} onDismiss={dismissSwipeHint} /> : null}
      </View>
    </View>
  );
}

/**
 * Кнопка решения. Лежит на фото, поэтому корпус — затемнение и светлая
 * кромка: без них на светлом снимке кнопка теряет край.
 */
function ActionButton({
  label,
  children,
  onPress,
  small = false,
  disabled = false,
  busy = false,
}: {
  label: string;
  children: ReactNode;
  onPress(): void;
  small?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple(dark.glassBorder, true)}
      style={({ pressed }) => [
        small ? styles.actionSmall : styles.action,
        { backgroundColor: dark.scrim, borderColor: dark.sheetBorder },
        disabled ? styles.disabled : pressedStyle(pressed),
      ]}
    >
      {busy ? <ActivityIndicator color={dark.text0} /> : children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, paddingHorizontal: 10 },
  stage: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 22,
    left: 10,
    right: 10,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  round: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  archive: { position: 'absolute', top: 78, left: 10, zIndex: 10 },
  browseLeft: { position: 'absolute', top: '42%', left: 4, zIndex: 10 },
  browseRight: { position: 'absolute', top: '42%', right: 4, zIndex: 10 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 6,
  },
  action: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  actionSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: { opacity: 0.4 },
  busy: { opacity: 0.6 },
  breakdown: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 25,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  breakdownHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  breakdownTitle: { fontFamily: fonts.displayBold, fontSize: 18 },
  error: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    zIndex: 35,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: fonts.displayBold, fontSize: 20, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  secondary: {
    minHeight: hitTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
