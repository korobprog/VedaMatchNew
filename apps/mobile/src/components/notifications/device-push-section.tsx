import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSession } from '@/lib/auth/session';
import { createDeliveryStatusApi } from '@/lib/notifications/delivery-status-api';
import {
  describeDeviceDelivery,
  shouldRefreshDelivery,
  type DeliveryRefreshReason,
  type DeliverySectionState,
} from '@/lib/push/device-delivery-state';
import { registerThisDevice } from '@/lib/push/device-registration';
import {
  openCallsChannelSettings,
  openMessagesChannelSettings,
  openNotificationSettings,
  readNotificationChannels,
  type NotificationChannelsState,
} from '@/lib/push/notification-channel';
import { pushRegistration, subscribePushRegistration } from '@/lib/push/push-registration';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import type { NotificationDeliveryStatusDto } from '@vedamatch/shared';

/**
 * «Уведомления на этом устройстве» на экране «Аккаунт» нативной сборки
 * (Android из RuStore и с сайта) — VED-329.
 *
 * Раньше здесь было пусто: считалось, что раз пуши включаются системным
 * запросом при первом входе (`src/lib/push/push-bridge.tsx`), говорить не о
 * чем. Жалоба 21.09 показала обратное — у человека не было ни одной живой
 * точки доставки, а приложение об этом молчало, и он ждал уведомлений,
 * которым некуда приходить. Портал этот разговор уже ведёт на сайте
 * (VED-314); здесь — та же правда про телефон в руках.
 *
 * Решение, ЧТО показать, целиком в `device-delivery-state.ts` — чистом модуле
 * со своими тестами. Здесь только сбор входных данных (итог регистрации
 * токена и ответ `GET /notifications/delivery-status`), обновление по
 * разумному поводу и разметка.
 *
 * Рядом лежит `device-push-section.web.tsx` — его берёт веб-сборка
 * (`ios.vedamatch.com`, VED-313), и этот файл она не видит вовсе.
 */
export function DevicePushSection() {
  // iOS из App Store пуши не регистрирует вовсе: `push-bridge.tsx` работает
  // только на Android. Обещать там доставку нельзя, а ругаться не на что —
  // пока самой доставки в сборке нет, честнее молчать, как и раньше.
  if (Platform.OS !== 'android') return null;
  return <DeviceDeliveryCard />;
}

function DeviceDeliveryCard() {
  const { colors } = useTheme();
  const { api } = useSession();
  const deliveryApi = useMemo(() => createDeliveryStatusApi(api), [api]);

  const registration = useSyncExternalStore(
    subscribePushRegistration,
    pushRegistration,
    pushRegistration,
  );
  const [status, setStatus] = useState<NotificationDeliveryStatusDto | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // Важность категорий «Сообщения» и «Звонки»: её человек меняет в системных
  // настройках, и приложение узнаёт об этом, только когда спросит.
  // Спрашиваем по тем же поводам, что и сервер, — это дешёвый локальный
  // вызов. Категории две (VED-361) и выключены бывают порознь.
  const [channels, setChannels] = useState<NotificationChannelsState>({
    messages: 'unknown',
    calls: 'unknown',
  });

  // Момент последнего УДАЧНОГО ответа: по нему решается, дёргать ли сервер на
  // этом заходе. Ref, а не state: от него ничего не рисуется.
  const checkedAt = useRef<number | null>(null);
  const request = useRef(0);
  // Человека увели в системные настройки. Возврат оттуда — всегда повод
  // перечитать всё заново: он мог только что выдать разрешение.
  const fromSettings = useRef(false);

  const load = useCallback(
    async (reason: DeliveryRefreshReason) => {
      if (!shouldRefreshDelivery({ reason, checkedAt: checkedAt.current, now: Date.now() })) return;
      const id = (request.current += 1);
      try {
        const response = await deliveryApi.status();
        if (request.current !== id) return;
        checkedAt.current = Date.now();
        setStatus(response);
        setStatusFailed(false);
      } catch {
        if (request.current !== id) return;
        // Ответа нет — прежний показывать нечестно: он мог устареть ровно
        // сейчас, и тогда человеку снова обещали бы доставку, про которую
        // приложение уже ничего не знает. Раздел скажет «не удалось
        // проверить» и предложит повтор.
        setStatus(null);
        setStatusFailed(true);
      }
    },
    [deliveryApi],
  );

  /** Состояние целиком: категории у системы (локально) и точки доставки у сервера. */
  const refresh = useCallback(
    async (reason: DeliveryRefreshReason) => {
      await Promise.all([readNotificationChannels().then(setChannels), load(reason)]);
    },
    [load],
  );

  // Экран открылся (или вернулся в фокус) — спрашиваем, но не чаще раза в
  // минуту: раздел листают туда-сюда, а доставка так быстро не меняется.
  useFocusEffect(
    useCallback(() => {
      void refresh('focus');
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const returned = fromSettings.current;
      fromSettings.current = false;
      if (returned) {
        // Вернулись из настроек уведомлений: заново спрашиваем разрешение и
        // токен — только это превратит свежее «разрешить» в живую точку
        // доставки, само по себе оно на сервер не попадёт.
        void registerThisDevice(api).finally(() => void refresh('manual'));
        return;
      }
      void refresh('foreground');
    });
    return () => subscription.remove();
  }, [api, refresh]);

  const section = describeDeviceDelivery({ registration, channels, status, statusFailed });

  /**
   * Уводим человека в настройки. Флаг «мы его туда отправили» снимается, если
   * открыть не вышло: иначе он остался бы взведённым навсегда и следующий
   * возврат на передний план по любому поводу зря дёргал бы регистрацию.
   */
  const goToSettings = useCallback(
    async (screen: 'app' | 'messages' | 'calls') => {
      fromSettings.current = true;
      setBusy(true);
      try {
        if (screen === 'messages') await openMessagesChannelSettings();
        else if (screen === 'calls') await openCallsChannelSettings();
        else await openNotificationSettings();
      } catch {
        fromSettings.current = false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const retry = useCallback(async () => {
    setBusy(true);
    try {
      await registerThisDevice(api);
      await refresh('manual');
    } finally {
      setBusy(false);
    }
  }, [api, refresh]);

  const recheck = useCallback(async () => {
    setBusy(true);
    try {
      await refresh('manual');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const press = useCallback(() => {
    if (section.action === 'settings') void goToSettings('app');
    else if (section.action === 'messages-channel-settings') void goToSettings('messages');
    else if (section.action === 'calls-channel-settings') void goToSettings('calls');
    else if (section.action === 'retry') void retry();
    else if (section.action === 'recheck') void recheck();
  }, [section.action, goToSettings, retry, recheck]);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text1 }]}>
        Уведомления на этом устройстве
      </Text>
      <View
        style={[styles.card, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}
      >
        <View style={styles.header}>
          {/* Точка — украшение состояния, а не текст: скринридер её не читает,
              смысл целиком в заголовке и объяснении рядом. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.dot, { backgroundColor: toneColor(section, colors) }]}
          />
          <Text style={[styles.title, { color: colors.text0 }]}>{section.title}</Text>
        </View>
        <Text selectable style={[styles.hint, { color: colors.text1 }]}>
          {section.hint}
        </Text>
        {section.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={press}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.magenta, borderColor: colors.magenta },
              pressedStyle(pressed),
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.onAccent }]}>
                {section.actionLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Цвет отметки состояния. `text2` сюда не годится: на стекле в тёмной теме он
 * даёт 4.06:1 — ниже порога (`theme/contrast.spec.ts`).
 */
function toneColor(
  section: DeliverySectionState,
  colors: { cyan: string; magenta: string; text1: string },
): string {
  if (section.tone === 'ok') return colors.cyan;
  if (section.tone === 'warn') return colors.magenta;
  return colors.text1;
}

const styles = StyleSheet.create({
  section: { gap: 8, marginTop: 4 },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 16 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  button: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
