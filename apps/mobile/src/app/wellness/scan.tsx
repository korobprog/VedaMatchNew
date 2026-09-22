import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AimFrame } from '@/components/wellness/aim-frame';
import { CameraGate } from '@/components/wellness/camera-gate';
import { ManualBarcodeForm } from '@/components/wellness/manual-barcode-form';
import { aimState, scanHelp, type LookupPhase } from '@/lib/wellness/aim-state';
import { barcodeFromScan } from '@/lib/wellness/barcode';
import { cameraAccess } from '@/lib/wellness/camera-access';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Сканер состава «Здоровья» (VED-335): камера, рамка прицеливания, фонарик,
 * приближение и ручной ввод.
 *
 * Разбор состава экран не делает вообще — только читает штрихкод и уходит на
 * экран ответа. Вердикт считает сервер, и это решение: правила справочника
 * правятся без выпуска новой сборки, а ответ у полки и ответ на сайте обязаны
 * совпадать до буквы.
 */

/**
 * Какие символики включены.
 *
 * На еде в России это почти всегда EAN-13; EAN-8 — мелкие пачки (жвачка,
 * специи), UPC-A/E — импорт, ITF-14 и GS1-128 — короба и часть фасовки.
 * QR, DataMatrix и PDF417 намеренно ВЫКЛЮЧЕНЫ: на упаковке их не меньше, чем
 * штрихкодов, и включённые они уводят сканер на ссылку с ценника или на
 * «честный знак» вместо товара. Code 39 тоже нет: это внутренние артикулы
 * магазина, в Open Food Facts их не ищут.
 */
const FOOD_BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'code128'] as const;

/** Два шага приближения. Больше не нужно: код должен заполнить рамку, не больше. */
const ZOOM_STEPS = [0, 0.25, 0.5] as const;

/**
 * Веб-сборка приложения (ios.vedamatch.com) — не место для сканера: камеры
 * там обычно нет, а `getUserMedia` требует https и разрешения браузера.
 * Экран честно предлагает ручной ввод вместо неработающего видоискателя.
 */
const IS_WEB = Platform.OS === 'web';

/** Как часто пересчитывается состояние рамки и таймеры помощи. */
const TICK_MS = 500;

export default function WellnessScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const access = cameraAccess(permission);

  const [torch, setTorch] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);
  const [sawAt, setSawAt] = useState<number | null>(null);
  const [lookup, setLookup] = useState<LookupPhase>('idle');
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [manualOpen, setManualOpen] = useState(false);
  // Тик времени: и рамка, и помощь — чистые функции от «сколько прошло», но
  // без тика перерисовки не случится. Камера просто перестаёт слать события,
  // а часы сами о себе не напоминают.
  const [now, setNow] = useState(() => Date.now());
  // Код уже отправлен — второй кадр с тем же кодом не должен открывать
  // экран ответа второй раз: камера шлёт событие по нескольку раз в секунду.
  const handed = useRef(false);

  const restart = useCallback(() => {
    handed.current = false;
    setLookup('idle');
    setSawAt(null);
    setManualOpen(false);
    setStartedAt(Date.now());
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Возврат с экрана ответа: прицел снова пустой, код снова принимается,
      // отсчёт помощи начинается заново.
      restart();
      return () => setTorch(false);
    }, [restart]),
  );

  useEffect(() => {
    if (lookup !== 'idle') return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [lookup]);

  const open = useCallback((barcode: string, kind: 'barcode' | 'manual') => {
    if (handed.current) return;
    handed.current = true;
    setLookup('pending');
    // Один отклик на одно действие, в тот же момент, что и зелёная рамка.
    // Не единственная обратная связь: рамка и слово меняются всегда.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    router.push({ pathname: '/wellness/result/[barcode]', params: { barcode, kind } });
  }, []);

  const onBarcode = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (handed.current) return;
      const barcode = barcodeFromScan(data);
      if (!barcode) {
        // Что-то декодировалось, но кодом еды не оказалось: смазано, срезано
        // или это вообще не про товар. Рамка жёлтая — «вижу, но не прочитал».
        setSawAt(Date.now());
        setNow(Date.now());
        return;
      }
      open(barcode, 'barcode');
    },
    [open],
  );

  const state = useMemo(() => aimState({ sawAt, now, lookup }), [sawAt, now, lookup]);
  const help = useMemo(
    () => scanHelp({ startedAt, now, lookup }),
    [startedAt, now, lookup],
  );
  // Ручной ввод раскрывается сам после долгой неудачи, но закрыть его обратно
  // может только человек — поэтому «или», а не подмена состояния.
  const showManual = manualOpen || help.offerManual;

  const manual = (
    <ManualBarcodeForm
      onSubmit={(barcode) => open(barcode, 'manual')}
      busy={lookup !== 'idle'}
    />
  );

  if (IS_WEB || access !== 'granted') {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg0 }}
        contentContainerStyle={[
          styles.fallback,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Header onHistory={() => router.push('/wellness/history')} />
        {IS_WEB ? (
          <View style={[styles.webNote, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <Text accessibilityRole="header" style={[styles.webTitle, { color: colors.text0 }]}>
              Здесь сканер не работает
            </Text>
            <Text style={[styles.webBody, { color: colors.text1 }]}>
              Это версия для браузера, камеры у неё нет. Ответ тот же — введите цифры штрихкода.
            </Text>
            {manual}
          </View>
        ) : (
          <CameraGate access={access} onRequest={() => void requestPermission()}>
            {manual}
          </CameraGate>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        zoom={ZOOM_STEPS[zoomStep]}
        barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
        onBarcodeScanned={onBarcode}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={styles.bar} pointerEvents="box-none">
          <OverlayButton label="Назад" onPress={() => router.back()} />
          <View style={styles.barRight}>
            <OverlayButton
              label={`Приблизить, сейчас ${zoomStep + 1} из ${ZOOM_STEPS.length}`}
              short={zoomStep === 0 ? 'Приблизить' : `Зум ${zoomStep + 1}×`}
              active={zoomStep > 0}
              onPress={() => setZoomStep((step) => (step + 1) % ZOOM_STEPS.length)}
            />
            <OverlayButton
              label={torch ? 'Выключить фонарик' : 'Включить фонарик'}
              short={torch ? 'Фонарик выкл.' : 'Фонарик'}
              active={torch}
              onPress={() => setTorch((value) => !value)}
            />
          </View>
        </View>

        <AimFrame state={state} />

        <View style={[styles.sheet, { backgroundColor: colors.bg1, paddingBottom: insets.bottom + 16 }]}>
          {help.hints.length ? (
            <View accessibilityLiveRegion="polite" style={styles.hints}>
              <Text style={[styles.hintsTitle, { color: colors.text0 }]}>
                Код не читается? Попробуйте:
              </Text>
              {help.hints.map((hint) => (
                <Text key={hint} style={[styles.hint, { color: colors.text1 }]}>
                  • {hint}
                </Text>
              ))}
            </View>
          ) : null}

          {showManual ? (
            manual
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setManualOpen(true)}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: colors.glassBorder },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.secondaryText, { color: colors.text0 }]}>
                Ввести код вручную
              </Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/wellness/history')}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>Последние проверки</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Header({ onHistory }: { onHistory(): void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Сканер состава
      </Text>
      <Text style={[styles.subtitle, { color: colors.text1 }]}>
        Наведите камеру на штрихкод — покажем, подходит ли продукт.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onHistory}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.secondary,
          { borderColor: colors.glassBorder },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.secondaryText, { color: colors.text0 }]}>Последние проверки</Text>
      </Pressable>
    </View>
  );
}

/**
 * Кнопка поверх видоискателя. Подпись словом, а не значком: значок на
 * картинке с камеры не читается ни глазом, ни скринридером, а обещать
 * контраст поверх произвольного кадра нельзя — поэтому под текстом своя
 * непрозрачная подложка `bg1`, пара с `text0` уже замерена.
 */
function OverlayButton({
  label,
  short,
  onPress,
  active = false,
}: {
  label: string;
  short?: string;
  onPress(): void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [
        styles.overlayButton,
        { backgroundColor: colors.bg1, borderColor: active ? colors.gold : colors.glassBorder },
        pressedStyle(pressed),
      ]}
    >
      <Text style={[styles.overlayButtonText, { color: colors.text0 }]}>{short ?? label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 12 },
  barRight: { flexDirection: 'row', gap: 8 },
  overlayButton: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  overlayButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  hints: { gap: 4 },
  hintsTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  fallback: { paddingHorizontal: 20, gap: 16 },
  header: { gap: 8 },
  title: { fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  webNote: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 12,
  },
  webTitle: { fontFamily: fonts.displayMedium, fontSize: 18 },
  webBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
