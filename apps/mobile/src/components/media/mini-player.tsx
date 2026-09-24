import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useMediaPlayer } from '@/lib/media/media-player-context';
import { miniPlayerView } from '@/lib/media/mini-player-view';
import { currentTrack } from '@/lib/media/player-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget } from '@/theme/tokens';
import { MediaCover } from './media-cover';
import { CloseGlyph, PauseGlyph, PlayGlyph } from './media-icons';

/**
 * Мини-плеер Медиатеки (VED-331): полоса над вкладками, пока выбрана
 * запись. Нажатие на название раскрывает полноэкранный плеер, справа —
 * «пауза/играть» и «закрыть».
 *
 * Появление — короткое проявление: оно редкое (запись выбрали), и без него
 * полоса выскакивала бы под пальцем. «Уменьшить движение» — мгновенно, как
 * у панели быстрого доступа (`quick-bar.tsx`). Прогресс — непрозрачная
 * полоса без детей: её ширина обновляется раз в полсекунды вместе со
 * статусом, анимировать там нечего.
 */
const DURATION_MS = 180;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER = FadeIn.duration(DURATION_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(DURATION_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

export function MiniPlayer() {
  const { colors } = useTheme();
  const player = useMediaPlayer();
  const view = player ? miniPlayerView(player.state, player.callBusy) : null;
  const track = player ? currentTrack(player.state) : null;
  if (!player || !view || !track) return null;

  const onPrimary = () => {
    if (view.primary === 'pause') player.pause();
    else void player.play();
  };

  return (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      style={[styles.bar, { backgroundColor: colors.bg1, borderTopColor: colors.glassBorder }]}
    >
      <View style={[styles.track, { backgroundColor: colors.bg2 }]} accessible={false} importantForAccessibility="no">
        <View style={[styles.fill, { width: `${view.progress * 100}%`, backgroundColor: colors.magenta }]} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${view.title}, ${view.subtitle}`}
        accessibilityHint="Открывает плеер на весь экран"
        onPress={() => router.push('/music/player')}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [styles.body, pressedStyle(pressed)]}
      >
        <MediaCover uri={track.coverUrl} size={40} />
        <View style={styles.texts}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text0 }]}>
            {view.title}
          </Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.text1 }]}>
            {view.subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={view.primaryLabel}
        accessibilityState={{ busy: view.waiting }}
        onPress={onPrimary}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.icon, pressedStyle(pressed)]}
      >
        {view.waiting ? (
          <ActivityIndicator color={colors.text0} />
        ) : view.primary === 'pause' ? (
          <PauseGlyph color={colors.text0} />
        ) : (
          <PlayGlyph color={colors.text0} />
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Остановить и закрыть плеер"
        onPress={player.stop}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.icon, pressedStyle(pressed)]}
      >
        <CloseGlyph color={colors.text1} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingLeft: 8,
    paddingRight: 4,
    paddingTop: 2,
  },
  track: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  fill: { position: 'absolute', top: 0, left: 0, bottom: 0 },
  body: {
    flex: 1,
    minHeight: hitTarget + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  texts: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 19 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  icon: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
