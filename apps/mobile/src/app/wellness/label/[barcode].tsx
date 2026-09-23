import type { WellnessScanResult } from '@vedamatch/shared';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { CameraGate } from '@/components/wellness/camera-gate';
import { ScreenBack } from '@/components/wellness/screen-back';
import { VerdictCard } from '@/components/wellness/verdict-card';
import { useSession } from '@/lib/auth/session';
import { cameraAccess } from '@/lib/wellness/camera-access';
import { labelCameraOn, showFrozenShot } from '@/lib/wellness/camera-power';
import {
  LABEL_QUALITY_STEPS,
  decideLabelShot,
  pickPictureSize,
} from '@/lib/wellness/label-photo';
import { createWellnessApi } from '@/lib/wellness/wellness-api';
import { describeScanError, type ScanFailure } from '@/lib/wellness/wellness-error';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Снимок состава, когда товара нет в базе (VED-335, второй заход).
 *
 * «Товара нет» перестаёт быть тупиком: человек снимает состав, получает ТОТ ЖЕ
 * вердикт, что и для найденного товара, и может назвать продукт — тогда
 * карточку получит и следующий человек у этой полки.
 *
 * Три решения, и все три обдуманные:
 *
 * 1. **Читает буквы сервер, не телефон.** Правило приёмки снимка («на нём
 *    должно быть слово „Состав“») обязано быть одним на сайт и на приложение;
 *    распознавание на устройстве дало бы два разных ответа на один снимок, и
 *    менять правило пришлось бы выпуском сборки в магазин.
 * 2. **Вердикт считается там же, где для штрихкода** — `POST wellness/scan` с
 *    `kind: 'photo'`. Своего разбора состава здесь нет ни строки: одни правила,
 *    один справочник, одно место правки.
 * 3. **Карточка уходит в модерацию, а не в общий доступ сразу.** Сервер
 *    заводит её со `status: 'draft'`, и поиск по штрихкоду её не отдаёт, пока
 *    модератор не проверил. Цена ошибки несимметрична: автор своё уже увидел,
 *    а одна опечатка в чужом составе молча отвечает неправдой всем.
 */
const IS_WEB = Platform.OS === 'web';

type Stage =
  | { kind: 'aim' }
  | { kind: 'reading' }
  | { kind: 'answer'; result: WellnessScanResult; ingredientsRaw: string };

export default function WellnessLabelScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const wellness = useMemo(() => createWellnessApi(api), [api]);
  const params = useLocalSearchParams<{ barcode: string }>();
  const barcode = String(params.barcode ?? '');

  const [permission, requestPermission] = useCameraPermissions();
  const access = cameraAccess(permission);
  const camera = useRef<CameraView>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [stage, setStage] = useState<Stage>({ kind: 'aim' });
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  /** Снятый кадр: он остаётся на экране вместо живого видоискателя. */
  const [shot, setShot] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) =>
      setAppActive(next === 'active'),
    );
    return () => sub.remove();
  }, []);

  const onCameraReady = useCallback(async () => {
    try {
      const sizes = await camera.current?.getAvailablePictureSizesAsync();
      // Самое маленькое разрешение, на котором буквы состава ещё читаются:
      // иначе снимок не влезет в предел сервера, а по мобильной сети в
      // магазине лишние мегабайты — это лишние секунды ожидания.
      setPictureSize(pickPictureSize(sizes ?? []) ?? undefined);
    } catch {
      // Не спросили размеры — снимем разрешением по умолчанию и, если не
      // влезет, пересжмём (`decideLabelShot`).
      setPictureSize(undefined);
    }
  }, []);

  /**
   * Затвор нажат. Отдельно от стадии: между нажатием и готовым кадром
   * проходит заметное время, и всё это время камера ещё нужна (стадия
   * остаётся `aim`), а вот второе нажатие — уже нет.
   */
  const [shooting, setShooting] = useState(false);

  const shoot = useCallback(
    async (attempt = 0): Promise<void> => {
      setFailure(null);
      setTooBig(null);
      setShooting(true);
      try {
        const picture = await camera.current?.takePictureAsync({
          quality: LABEL_QUALITY_STEPS[attempt],
          base64: true,
          imageType: 'jpg',
        });
        if (!picture?.base64) {
          setTooBig('Снимок не получился — попробуйте ещё раз.');
          setStage({ kind: 'aim' });
          return;
        }
        // Кадр снят: камеру отпускаем (стадия `reading` её размонтирует), а
        // на экране остаётся сам снимок — человеку видно, что именно ушло в
        // разбор, и телефон перестаёт греться.
        setShot(picture.uri ?? null);
        setStage({ kind: 'reading' });
        const decision = decideLabelShot(picture.base64, attempt);
        if (decision.kind === 'retry') {
          // Пересжимаем — для этого камера нужна снова.
          setStage({ kind: 'aim' });
          return shoot(attempt + 1);
        }
        if (decision.kind === 'too-big') {
          setTooBig(decision.message);
          setStage({ kind: 'aim' });
          return;
        }

        const { ingredientsRaw } = await wellness.recognize(decision.imageDataUrl);
        // Вердикт считает тот же сервер и по тем же правилам, что для
        // штрихкода. Заодно проверка попадает в историю.
        const result = await wellness.scan({ kind: 'photo', ingredientsRaw });
        setStage({ kind: 'answer', result, ingredientsRaw });
      } catch (error) {
        setFailure(describeScanError(error));
        setStage({ kind: 'aim' });
      } finally {
        setShooting(false);
      }
    },
    [wellness],
  );

  if (IS_WEB || access !== 'granted') {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg0 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
          Снимок состава
        </Text>
        {IS_WEB ? (
          <Text style={[styles.body, { color: colors.text1 }]}>
            В версии для браузера камеры нет — снимите состав в приложении или на сайте.
          </Text>
        ) : (
          <CameraGate access={access} onRequest={() => void requestPermission()} />
        )}
      </ScrollView>
    );
  }

  if (stage.kind === 'answer') {
    return (
      <Answer
        result={stage.result}
        ingredientsRaw={stage.ingredientsRaw}
        barcode={barcode}
        onRetake={() => {
          setShot(null);
          setStage({ kind: 'aim' });
        }}
      />
    );
  }

  const busy = shooting || stage.kind === 'reading';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {/* Камера монтируется, только пока целятся (`camera-power.ts`):
          `active` у `CameraView` — свойство только для iOS, а спрятанный
          экземпляр на Android продолжает держать камеру. Размонтирование
          зовёт `unbindAll()` — тот же вызов, что и `pausePreview()`. */}
      {labelCameraOn({ focused, appActive, stage: stage.kind }) ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          active
          pictureSize={pictureSize}
          onCameraReady={() => void onCameraReady()}
        />
      ) : null}
      {showFrozenShot({ stage: stage.kind, hasShot: Boolean(shot) }) && shot ? (
        <Image
          source={{ uri: shot }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <View style={[styles.overlay, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
        <View style={[styles.hintCard, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}>
          <Text accessibilityRole="header" style={[styles.hintTitle, { color: colors.text0 }]}>
            Снимите состав
          </Text>
          <Text style={[styles.body, { color: colors.text1 }]}>
            В кадр должно попасть слово «Состав» и весь список под ним. Вся упаковка
            не нужна — подойдите ближе.
          </Text>
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.bg1, paddingBottom: insets.bottom + 16 }]}>
          {failure ? <InlineError message={failure.message} /> : null}
          {tooBig ? <InlineError message={tooBig} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void shoot()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta, opacity: busy ? 0.45 : 1 },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>
              {stage.kind === 'reading' ? 'Читаем состав…' : busy ? 'Снимаем…' : 'Снять состав'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>Назад</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Ответ по снимку плюс предложение назвать продукт и отправить его в базу. */
function Answer({
  result,
  ingredientsRaw,
  barcode,
  onRetake,
}: {
  result: WellnessScanResult;
  ingredientsRaw: string;
  barcode: string;
  onRetake(): void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const wellness = useMemo(() => createWellnessApi(api), [api]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<ScanFailure | null>(null);

  const save = useCallback(async () => {
    setSaving(true);
    setFailure(null);
    try {
      await wellness.createProduct({ barcode, name: name.trim(), ingredientsRaw });
      setSaved(true);
    } catch (error) {
      setFailure(describeScanError(error));
    } finally {
      setSaving(false);
    }
  }, [barcode, ingredientsRaw, name, wellness]);

  return (
    /* Поле «Название с упаковки» уходило под клавиатуру целиком — дефект
       найден пользователем на сборке 5018. Обычный `ScrollView` клавиатуру не
       видит; `KeyboardAwareScrollView` из `react-native-keyboard-controller` —
       принятый в проекте способ для форм (`profile.tsx`, `people/[id].tsx`).
       `bottomOffset` поднимает поле вместе с подписью и кнопкой под ним. */
    <KeyboardAwareScrollView
      style={{ backgroundColor: colors.bg0 }}
      bottomOffset={160}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenBack />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        Ответ по снимку
      </Text>
      <VerdictCard result={result} />

      {saved ? (
        <View style={[styles.savedCard, { backgroundColor: colors.bg1, borderColor: colors.success }]}>
          <Text accessibilityRole="header" style={[styles.hintTitle, { color: colors.text0 }]}>
            Отправлено на проверку
          </Text>
          <Text style={[styles.body, { color: colors.text1 }]}>
            Пока карточку видят только модераторы: чужой состав с опечаткой молча
            отвечал бы неправдой всем. Ваш ответ уже выше и никуда не денется.
          </Text>
          {/* Дело сделано — отсюда должен быть очевидный выход. Первым
              «к сканеру»: человек у полки проверяет не один продукт, и
              следующий шаг почти всегда этот. `navigate`, а не `push`:
              сканер уже лежит в стеке ниже, и новый его экземпляр поверх
              старого сломал бы «назад». */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/wellness/scan')}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>
              Готово, вернуться к сканеру
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/wellness/history')}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>
              К моим проверкам
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.saveCard, { backgroundColor: colors.bg1 }]}>
          <Text accessibilityRole="header" style={[styles.hintTitle, { color: colors.text0 }]}>
            Добавить продукт в базу
          </Text>
          <Text style={[styles.body, { color: colors.text1 }]}>
            Состав уже прочитан. Назовите продукт так, как написано на упаковке, — и
            следующий человек найдёт его по штрихкоду.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            editable={!saving}
            maxLength={160}
            placeholder="Например: Мармелад «Ягодка»"
            placeholderTextColor={colors.text1}
            accessibilityLabel="Название продукта с упаковки"
            style={[
              styles.input,
              { color: colors.text0, backgroundColor: colors.bg0, borderColor: colors.glassBorder },
            ]}
          />
          {failure ? <InlineError message={failure.message} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !name.trim() || saving, busy: saving }}
            disabled={!name.trim() || saving}
            onPress={() => void save()}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: colors.magenta,
                opacity: !name.trim() || saving ? 0.45 : 1,
              },
              pressedStyle(pressed),
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.primaryText, { color: colors.onAccent }]}>
                Отправить на проверку
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onRetake}
        android_ripple={ripple(colors.glassBorder)}
        style={({ pressed }) => [
          styles.secondary,
          { borderColor: colors.glassBorder },
          pressedStyle(pressed),
        ]}
      >
        <Text style={[styles.secondaryText, { color: colors.text0 }]}>
          {saved ? 'Снять ещё состав' : 'Переснять состав'}
        </Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  content: { paddingHorizontal: 20, gap: 16 },
  title: { fontFamily: fonts.displayBold, fontSize: 22 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  hintCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
    gap: 6,
  },
  hintTitle: { fontFamily: fonts.bodyBold, fontSize: 16 },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  saveCard: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  savedCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 6,
  },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  primary: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
