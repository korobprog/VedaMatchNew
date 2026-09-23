import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServiceIcon } from '@/components/services/service-icons';
import { appVariant } from '@/config/app-variant';
import { useSession } from '@/lib/auth/session';
import { openService } from '@/lib/services/open-service';
import { quickPinsStore, useQuickPins, type QuickPinsStore } from '@/lib/services/quick-pins-store';
import { serviceIconKind } from '@/lib/services/service-icon-kind';
import { hasInAppScreen } from '@/lib/services/service-route';
import { createServicesApi } from '@/lib/services/services-api';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Панель быстрого доступа (VED-385): узкая полоса закреплённых сервисов над
 * вкладками. Где стоит и где её нет — `lib/services/quick-bar-placement.ts`;
 * что закреплено — `lib/services/quick-pins-store.ts`; настраивается из
 * вкладки «Сервисы» (`components/services/quick-pin-settings.tsx`).
 *
 * Ничего не закреплено — панели нет совсем, ни пустой полосы, ни подсказки:
 * место наверху дорогое, и подсказка «закрепите» живёт только в «Сервисах».
 *
 * Движение (`expo-animation`): появление и исчезновение панели — редкое
 * событие (человек закрепил первый сервис или открепил последний), цель —
 * смягчить резкую перемену. Только прозрачность, 180 мс, ease-out; сдвига и
 * масштаба нет. На старте приложения не анимируется (`skipEntering`): это не
 * действие человека. При «уменьшить движение» — мгновенно
 * (`ReduceMotion.System`): экран под панелью всё равно сдвигается скачком, и
 * добавлять к нему ещё и плавное проявление незачем.
 */

const DURATION_MS = 180;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER = FadeIn.duration(DURATION_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
const EXIT = FadeOut.duration(DURATION_MS).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

/** `store` подменяется только в тестах; в приложении — общий `quickPinsStore`. */
export function QuickBar({ store = quickPinsStore }: { store?: QuickPinsStore }) {
  return (
    <LayoutAnimationConfig skipEntering>
      <QuickBarInner store={store} />
    </LayoutAnimationConfig>
  );
}

function QuickBarInner({ store }: { store: QuickPinsStore }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pins = useQuickPins(store);
  const { api } = useSession();
  const { webOrigin } = appVariant();
  const hasPins = pins.length > 0;

  // Снимок закреплённого сверяется с каталогом раз за запуск: сервис, который
  // администратор выключил или перевёл в «Скоро», не должен висеть чипом в
  // никуда до первого захода во «Сервисы». Ошибка сети — не повод что-то
  // трогать: снимок остаётся прежним.
  useEffect(() => {
    if (!hasPins) return;
    let alive = true;
    createServicesApi(api)
      .list()
      .then((cards) => {
        if (alive) void store.reconcile(cards);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api, hasPins, store]);

  if (!hasPins) return null;

  return (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      accessibilityRole="toolbar"
      accessibilityLabel="Быстрый доступ к сервисам"
      style={[
        styles.bar,
        { paddingTop: insets.top, backgroundColor: colors.bg0, borderBottomColor: colors.glassBorder },
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {pins.map((pin) => (
          <Pressable
            key={pin.slug}
            accessibilityRole="link"
            accessibilityLabel={pin.name}
            accessibilityHint={
              hasInAppScreen(pin.slug) ? 'Открывает раздел в приложении' : 'Открывает раздел на сайте в браузере'
            }
            onPress={() => openService(pin, webOrigin)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: colors.glass, borderColor: colors.glassBorder },
              pressedStyle(pressed),
            ]}
          >
            <View accessible={false} importantForAccessibility="no-hide-descendants">
              <ServiceIcon kind={serviceIconKind(pin.slug)} size={ICON_SIZE} />
            </View>
            <Text numberOfLines={1} style={[styles.label, { color: colors.text0 }]}>
              {pin.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const ICON_SIZE = 20;

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  // Поля 12 и промежуток 6 — из расчёта предела: пять чипов по 70 на 412 dp
  // (`QUICK_PIN_LIMIT` в `quick-pins.ts`).
  row: { paddingHorizontal: 12, paddingVertical: 4, gap: 6 },
  chip: {
    width: 70,
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14, maxWidth: '100%' },
});
