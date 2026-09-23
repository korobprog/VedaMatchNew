import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MediaTrack } from '@/lib/media/media-parse';
import { formatClock, spokenClock } from '@/lib/media/playback-math';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { MediaCover } from './media-cover';
import { PauseGlyph, PlayGlyph } from './media-icons';

export type RowPlayback = 'none' | 'playing' | 'paused';

/**
 * Строка записи в списке Медиатеки и в главах книги (VED-331). Вся строка —
 * одна кнопка «Включить»: на телефоне отдельная крошечная ▶ в углу строки
 * промахивается пальцем, а страницы записи в приложении на этапе 1 нет.
 *
 * Своя запись в плеере помечена словами «Играет»/«Пауза» на плашке `bg2` и
 * значком — не цветом одним.
 */
export const MediaTrackRow = memo(function MediaTrackRow({
  track,
  playback,
  onPress,
  prefix,
}: {
  track: MediaTrack;
  playback: RowPlayback;
  onPress(track: MediaTrack): void;
  /** Номер главы в книге — перед названием. */
  prefix?: string;
}) {
  const { colors } = useTheme();
  const duration = track.durationSeconds > 0 ? formatClock(track.durationSeconds) : null;
  const state = playback === 'playing' ? 'Играет' : playback === 'paused' ? 'Пауза' : null;
  const label = [
    prefix ? `${prefix}. ${track.title}` : track.title,
    track.artist,
    track.durationSeconds > 0 ? spokenClock(track.durationSeconds) : null,
    state ? `Сейчас: ${state.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={playback === 'playing' ? 'Ставит на паузу' : 'Включает запись'}
      onPress={() => onPress(track)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, pressedStyle(pressed)]}
    >
      <MediaCover uri={track.coverUrl} size={48} />
      <View style={styles.texts}>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text0 }]}>
          {prefix ? `${prefix}. ` : ''}
          {track.title}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.text1 }]}>
          {[track.artist, duration].filter(Boolean).join(' · ') || ' '}
        </Text>
      </View>
      {state ? (
        <View style={[styles.badge, { backgroundColor: colors.bg2 }]}>
          {playback === 'playing' ? <PlayGlyph color={colors.text0} size={12} /> : <PauseGlyph color={colors.text0} size={12} />}
          <Text style={[styles.badgeText, { color: colors.text0 }]}>{state}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: hitTarget + 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  texts: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
