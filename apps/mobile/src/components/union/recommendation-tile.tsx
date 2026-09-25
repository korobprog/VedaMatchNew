import type { UnionRecommendation } from '@vedamatch/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { nameWithAge, tileAccessibilityLabel } from '@/lib/union/union-labels';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts } from '@/theme/tokens';
import { CheckIcon } from './union-icons';
import { PhotoShade, UnionPhoto } from './union-photo';

/**
 * Плитка сетки: квадратное фото, поверх — имя, возраст и процент
 * (`recommendation-tile.tsx` сайта). Квадрат, а не портрет: при двух колонках
 * портретная плитка даёт три с половиной ряда за экран, квадратная — четыре.
 * Дальше сплющивать нельзя — в альбомной обрезке режутся лица.
 *
 * Плитке полноразмерный снимок не нужен — уменьшенная копия, если она есть.
 */
export const RecommendationTile = memo(function RecommendationTile({
  item,
  size,
  onOpen,
}: {
  item: UnionRecommendation;
  size: number;
  onOpen(): void;
}) {
  const { colors } = useTheme();
  const { user, compatibility } = item;
  const cover = user.photos[0]?.thumbUrl ?? user.photos[0]?.url ?? user.avatarUrl;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileAccessibilityLabel(user, compatibility.total, item.myDecision)}
      accessibilityHint="Открывает колоду с этой анкеты"
      onPress={onOpen}
      android_ripple={ripple(dark.glassBorder)}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size, borderColor: colors.glassBorder, backgroundColor: colors.bg2 },
        pressedStyle(pressed),
      ]}
    >
      <UnionPhoto uri={cover} name={user.name} initialSize={size / 4} />
      <PhotoShade height="45%" />
      <Text style={[styles.percent, { color: dark.text0, backgroundColor: dark.scrim }]}>{`${compatibility.total}%`}</Text>
      {item.myDecision ? (
        <View style={[styles.decided, { backgroundColor: dark.scrim }]}>
          <CheckIcon color={dark.text0} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[styles.name, { color: dark.text0 }]}>
        {nameWithAge(user)}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, overflow: 'hidden' },
  percent: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  decided: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { position: 'absolute', left: 8, right: 8, bottom: 8, fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
