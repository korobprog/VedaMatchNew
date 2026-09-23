import type { WellnessHistoryItem } from '@vedamatch/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { ScreenBack } from '@/components/wellness/screen-back';
import { useSession } from '@/lib/auth/session';
import { HISTORY_EMPTY, describeHistoryItem } from '@/lib/wellness/history-copy';
import type { VerdictTone } from '@/lib/wellness/verdict-copy';
import { createWellnessApi } from '@/lib/wellness/wellness-api';
import { describeScanError, type ScanFailure } from '@/lib/wellness/wellness-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius, type Palette } from '@/theme/tokens';

/**
 * Последние проверки (VED-335). Нужны не как архив: у полки человек сравнивает
 * два похожих йогурта и через минуту не помнит, какой из них был какой.
 *
 * Строка ведёт на тот же экран ответа, что и свежий скан: вердикт пересчитают
 * заново. Показывать сохранённый ответ было бы враньём — ограничения могли
 * поменяться после проверки, и сервер по той же причине считает вердикт
 * корзины на лету.
 */
const TONE_TOKEN: Record<VerdictTone, keyof Palette> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'text1',
};

export default function WellnessHistoryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const wellness = useMemo(() => createWellnessApi(api), [api]);

  const [data, setData] = useState<WellnessHistoryItem[] | null>(null);
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const rows = await wellness.history();
      if (request.current !== id) return;
      setData(rows);
      setFailure(null);
    } catch (error) {
      if (request.current !== id) return;
      setFailure(describeScanError(error));
    } finally {
      if (request.current === id) setRetrying(false);
    }
  }, [wellness]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg0 }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <ScreenBack />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Последние проверки
      </Text>

      {failure ? (
        <View style={styles.block}>
          <InlineError message={failure.message} />
          {failure.retryable ? (
            <RetryButton
              onPress={() => {
                setRetrying(true);
                void load();
              }}
              busy={retrying}
            />
          ) : null}
        </View>
      ) : null}

      {!data && !failure ? <ActivityIndicator color={colors.magenta} /> : null}

      {data && data.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.emptyTitle, { color: colors.text0 }]}>{HISTORY_EMPTY.title}</Text>
          <Text style={[styles.emptyBody, { color: colors.text1 }]}>{HISTORY_EMPTY.body}</Text>
        </View>
      ) : null}

      {data?.map((item) => {
        const line = describeHistoryItem(item);
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={line.accessibilityLabel}
            disabled={!item.barcode}
            onPress={() => {
              if (!item.barcode) return;
              router.push({
                pathname: '/wellness/result/[barcode]',
                params: { barcode: item.barcode, kind: 'manual' },
              });
            }}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.row,
              { borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <View style={styles.rowText}>
              <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text0 }]}>
                {line.title}
              </Text>
              <Text style={[styles.rowSub, { color: colors.text1 }]}>{line.subtitle}</Text>
            </View>
            {/* Слово, а не цветная точка: ответ обязан читаться и без цвета. */}
            <Text style={[styles.rowVerdict, { color: colors[TONE_TOKEN[line.tone]] }]}>
              {line.verdict}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  title: { fontFamily: fonts.displayBold, fontSize: 22, marginBottom: 4 },
  block: { gap: 12 },
  empty: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 8,
  },
  emptyTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  row: {
    minHeight: hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  rowSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  rowVerdict: { fontFamily: fonts.bodyBold, fontSize: 14 },
});
