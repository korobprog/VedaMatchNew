import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { MediaCover } from '@/components/media/media-cover';
import { ChevronDownGlyph, PauseGlyph, PlayGlyph, SkipGlyph } from '@/components/media/media-icons';
import { SeekBar } from '@/components/media/seek-bar';
import { RetryButton } from '@/components/retry-button';
import { useMediaPlayer } from '@/lib/media/media-player-context';
import { formatClock, SKIP_SECONDS } from '@/lib/media/playback-math';
import { currentTrack, hasNext, hasPrevious, isActive } from '@/lib/media/player-state';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Полноэкранный плеер Медиатеки (VED-331). Открывается нажатием на
 * мини-плеер снизу вверх (модалью корневого стека), сворачивается стрелкой
 * «вниз» или системным «назад» — звук при этом не прерывается.
 *
 * Управление — то же, что в шторке и на экране блокировки: пауза,
 * «−10/+10» и шкала. «Предыдущая/следующая» появятся, когда в очереди
 * будет больше одной записи (этап 2) — сейчас их кнопок нет вовсе, а не
 * погашенных: погашенная кнопка без объяснения выглядит сломанной.
 */
export default function MediaPlayerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const player = useMediaPlayer();
  const track = player ? currentTrack(player.state) : null;

  const collapse = () => (router.canGoBack() ? router.back() : router.replace('/music'));

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Свернуть плеер"
        onPress={collapse}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.round, pressedStyle(pressed)]}
      >
        <ChevronDownGlyph color={colors.text0} />
      </Pressable>
      <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.text0 }]}>
        Сейчас играет
      </Text>
      <View style={styles.round} />
    </View>
  );

  if (!player || !track) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.text1 }]}>Сейчас ничего не играет. Выберите запись в Медиатеке.</Text>
          <RetryButton label="К Медиатеке" onPress={() => router.replace('/music')} />
        </View>
      </View>
    );
  }

  const { state } = player;
  const active = isActive(state);
  const waiting = state.status === 'loading' || state.status === 'buffering';
  const coverSize = Math.min(width - 64, 320);
  const canSeek = state.status !== 'loading' && state.status !== 'error';
  const primaryLabel = active ? 'Пауза' : 'Играть';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <MediaCover uri={track.coverUrl} size={coverSize} />
        <View style={styles.texts}>
          <Text style={[styles.title, { color: colors.text0 }]} selectable>
            {track.title}
          </Text>
          {track.artist || track.album ? (
            <Text style={[styles.artist, { color: colors.text1 }]} selectable>
              {[track.artist, track.album].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={styles.seek}>
          <SeekBar
            positionSec={state.positionSec}
            durationSec={state.durationSec}
            disabled={!canSeek}
            onSeek={player.seekTo}
          />
          <View style={styles.times}>
            <Text style={[styles.time, { color: colors.text1 }]}>{formatClock(state.positionSec)}</Text>
            <Text style={[styles.time, { color: colors.text1 }]}>
              {state.durationSec > 0 ? formatClock(state.durationSec) : '—:—'}
            </Text>
          </View>
        </View>

        <View style={styles.controls}>
          {hasPrevious(state) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Предыдущая запись"
              onPress={() => void player.previous()}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [styles.round, pressedStyle(pressed)]}
            >
              <SkipGlyph color={colors.text0} forward={false} size={22} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Назад на ${SKIP_SECONDS} секунд`}
            disabled={!canSeek}
            accessibilityState={{ disabled: !canSeek }}
            onPress={() => player.skip(-SKIP_SECONDS)}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [styles.skip, !canSeek && styles.off, pressedStyle(pressed)]}
          >
            <SkipGlyph color={colors.text0} forward={false} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ busy: waiting, disabled: state.status === 'error' }}
            disabled={state.status === 'error'}
            onPress={() => (active ? player.pause() : void player.play())}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta },
              state.status === 'error' && styles.off,
              pressedStyle(pressed),
            ]}
          >
            {waiting ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : active ? (
              <PauseGlyph color={colors.onAccent} size={32} />
            ) : (
              <PlayGlyph color={colors.onAccent} size={32} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Вперёд на ${SKIP_SECONDS} секунд`}
            disabled={!canSeek}
            accessibilityState={{ disabled: !canSeek }}
            onPress={() => player.skip(SKIP_SECONDS)}
            android_ripple={ripple(colors.glassBorder, true)}
            style={({ pressed }) => [styles.skip, !canSeek && styles.off, pressedStyle(pressed)]}
          >
            <SkipGlyph color={colors.text0} forward />
          </Pressable>
          {hasNext(state) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Следующая запись"
              onPress={() => void player.next()}
              android_ripple={ripple(colors.glassBorder, true)}
              style={({ pressed }) => [styles.round, pressedStyle(pressed)]}
            >
              <SkipGlyph color={colors.text0} forward size={22} />
            </Pressable>
          ) : null}
        </View>

        <Text accessibilityLiveRegion="polite" style={[styles.status, { color: colors.text1 }]}>
          {player.callBusy && !active
            ? 'Идёт звонок — запись продолжится, когда он закончится.'
            : state.status === 'buffering'
              ? 'Ждём сеть…'
              : state.status === 'loading'
                ? 'Загружаем запись…'
                : state.status === 'ended'
                  ? 'Запись дослушана. Нажмите «Играть», чтобы начать сначала.'
                  : ''}
        </Text>

        {state.status === 'error' ? (
          <View style={styles.error}>
            <InlineError message={state.error ?? 'Не удалось воспроизвести запись.'} />
            <RetryButton onPress={() => void player.play()} />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityHint="Останавливает звук и убирает плеер из шторки"
          onPress={() => {
            player.stop();
            collapse();
          }}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.stop, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.stopText, { color: colors.text0 }]}>Остановить и закрыть</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4 },
  headerTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  round: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, gap: 20 },
  texts: { alignSelf: 'stretch', gap: 6 },
  title: { fontFamily: fonts.displayMedium, fontSize: 20, lineHeight: 28 },
  artist: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  seek: { alignSelf: 'stretch', gap: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: fonts.mono, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  skip: {
    width: hitTarget + 12,
    height: hitTarget + 12,
    borderRadius: (hitTarget + 12) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  off: { opacity: 0.5 },
  status: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', minHeight: 20 },
  error: { alignSelf: 'stretch', gap: 10, alignItems: 'center' },
  stop: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stopText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  emptyText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
