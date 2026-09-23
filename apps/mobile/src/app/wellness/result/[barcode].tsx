import type { WellnessScanResult } from '@vedamatch/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { RetryButton } from '@/components/retry-button';
import { ScreenBack } from '@/components/wellness/screen-back';
import { useSession } from '@/lib/auth/session';
import { VerdictCard } from '@/components/wellness/verdict-card';
import { MISSING_PRODUCT_COPY, isMissingProduct } from '@/lib/wellness/verdict-copy';
import { barcodeScanRequest, createWellnessApi } from '@/lib/wellness/wellness-api';
import { describeScanError, type ScanFailure } from '@/lib/wellness/wellness-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Ответ сканера (VED-335): крупно «подходит / сомнительно / не подходит»,
 * ниже — что именно смутило, состав целиком, название и картинка товара.
 *
 * Экран сам спрашивает сервер по штрихкоду из адреса, а не получает готовый
 * ответ от сканера. Так он открывается ссылкой, переживает поворот экрана и
 * умеет «Повторить» — а главное, тем же адресом сможет открыться сайт, когда
 * до него дойдут руки: вердикт один и считается в одном месте.
 */
export default function WellnessResultScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const wellness = useMemo(() => createWellnessApi(api), [api]);
  const params = useLocalSearchParams<{ barcode: string; kind?: string }>();
  const barcode = String(params.barcode ?? '');
  const kind = params.kind === 'manual' ? 'manual' : 'barcode';

  const [data, setData] = useState<WellnessScanResult | null>(null);
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const result = await wellness.scan(barcodeScanRequest(barcode, kind));
      if (request.current !== id) return;
      setData(result);
      setFailure(null);
    } catch (error) {
      if (request.current !== id) return;
      setFailure(describeScanError(error));
    } finally {
      if (request.current === id) setRetrying(false);
    }
  }, [barcode, kind, wellness]);

  useEffect(() => {
    void load();
  }, [load]);

  const body = (() => {
    if (failure) return <Failure failure={failure} onRetry={() => { setRetrying(true); void load(); }} retrying={retrying} />;
    if (!data) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.magenta} />
          <Text style={[styles.waiting, { color: colors.text1 }]}>Ищем товар и разбираем состав…</Text>
        </View>
      );
    }
    return (
      <View style={styles.block}>
        <VerdictCard result={data} />
        {isMissingProduct(data) ? <AddByPhoto barcode={barcode} /> : null}
      </View>
    );
  })();

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg0 }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Выход наверху: сюда приходят и со сканера, и из истории, и по
          ссылке — нижняя кнопка «Проверить ещё продукт» для второго и
          третьего случая называлась бы неправдой. */}
      <ScreenBack />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.screenTitle, { color: colors.text0 }]}>
          Ответ сканера
        </Text>
        <Text selectable style={[styles.barcode, { color: colors.text1 }]}>
          Штрихкод {barcode}
        </Text>
      </View>
      {body}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [styles.again, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
      >
        <Text style={[styles.againText, { color: colors.text0 }]}>Проверить ещё продукт</Text>
      </Pressable>
    </ScrollView>
  );
}

function Failure({
  failure,
  onRetry,
  retrying,
}: {
  failure: ScanFailure;
  onRetry(): void;
  retrying: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.block}>
      <InlineError message={failure.message} />
      {failure.kind === 'not-found' ? (
        <Text style={[styles.note, { color: colors.text1 }]}>{MISSING_PRODUCT_COPY.hint}</Text>
      ) : null}
      {/* Кнопка появляется только там, где повтор помогает: «товара нет в
          базе» повторять бессмысленно, и кнопка была бы издевательством. */}
      {failure.retryable ? <RetryButton onPress={onRetry} busy={retrying} /> : null}
    </View>
  );
}

/**
 * Товара нет в базе — и это не тупик, а приглашение её пополнить (VED-335,
 * второй заход). То же самое умеет сайт; здесь путь короче, потому что
 * камера уже в руках.
 */
function AddByPhoto({ barcode }: { barcode: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.invite, { backgroundColor: colors.bg1 }]}>
      <Text accessibilityRole="header" style={[styles.inviteTitle, { color: colors.text0 }]}>
        Сфотографируйте состав
      </Text>
      <Text style={[styles.note, { color: colors.text1 }]}>{MISSING_PRODUCT_COPY.hint}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: '/wellness/label/[barcode]', params: { barcode } })
        }
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.invitePrimary,
          { backgroundColor: colors.magenta },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.invitePrimaryText, { color: colors.onAccent }]}>
          Снять состав камерой
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16 },
  head: { gap: 4 },
  screenTitle: { fontFamily: fonts.displayBold, fontSize: 22 },
  barcode: { fontFamily: fonts.mono, fontSize: 13 },
  center: { gap: 12, alignItems: 'center', paddingVertical: 40 },
  waiting: { fontFamily: fonts.body, fontSize: 14 },
  block: { gap: 16 },
  card: {
    borderWidth: 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 20,
    gap: 6,
  },
  // 30 px, полужирный: главное слово экрана видно с вытянутой руки в магазине.
  verdict: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 38 },
  summary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  product: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  photo: { width: 64, height: 64, borderRadius: radius.sm },
  productText: { flex: 1, gap: 2 },
  productName: { fontFamily: fonts.bodySemiBold, fontSize: 15, lineHeight: 20 },
  brand: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: fonts.displayMedium, fontSize: 16 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  line: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    padding: 10,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  raw: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    padding: 12,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  again: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  againText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  invite: { borderRadius: radius.md, borderCurve: 'continuous', padding: 16, gap: 10 },
  inviteTitle: { fontFamily: fonts.displayMedium, fontSize: 17 },
  invitePrimary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  invitePrimaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
