import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { ConferenceReturn } from '@/components/chat/conference-return';
import { OfflineBannerFrame } from '@/components/startup/offline-banner';
import { StartupOfflineScreen } from '@/components/startup/startup-offline-screen';
import { useSession } from '@/lib/auth/session';
import { OnboardingGateProvider, useOnboardingGate } from '@/lib/onboarding/onboarding-gate';
import { PushBridge } from '@/lib/push/push-bridge';
import { quickPinsStore } from '@/lib/services/quick-pins-store';
import { useConnectivity } from '@/lib/startup/connectivity';
import {
  decideStartupView,
  shouldAutoRetryRestore,
  shouldReloadProfile,
  shouldShowOfflineBanner,
  STARTUP_STALL_MS,
  type Connectivity,
  type SessionStatusLike,
} from '@/lib/startup/startup-decision';
import { TelegramShell } from '@/lib/telegram/telegram-shell';
import { useTheme } from '@/theme/theme';

/**
 * Стек экранов — общий для `root-shell.tsx` (телефон) и `root-shell.web.tsx`
 * (браузер): список экранов один, платформы расходятся только в наборе
 * провайдеров (`RootProviders`), см. оба файла.
 *
 * Гость видит только экран входа, вошедший — только вкладки. Пока сессия
 * восстанавливается, показываем пустой фон темы: мигание экрана входа перед
 * чатами выглядит как разлогин. Если восстановление затянулось — экран «Нет
 * соединения» с «Повторить» (раньше тут был `return null` и вечный белый
 * экран без сети, Realme, Android 12); вошедший без сети видит вкладки с
 * плашкой. Решения — `lib/startup/startup-decision.ts`.
 *
 * Третья развилка — онбординг новичка (VED-333): у вошедшего без пола или
 * этапа пути доступен ровно один экран вопросов, и он стоит ВЫШЕ вкладок,
 * потому что `Stack.Protected` при смене охраны уводит на первый доступный
 * экран. Ответил или отложил — группа схлопывается, и первым доступным
 * снова становится `(tabs)`.
 */
export function RootStack() {
  return (
    <OnboardingGateProvider>
      <RootStackInner />
    </OnboardingGateProvider>
  );
}

/**
 * Сколько длится «загрузка» сессии — чтобы через `STARTUP_STALL_MS` сменить
 * пустой фон на экран повтора. Отсчёт от первого рендера: «загрузка» бывает
 * только на старте, выход из аккаунта ведёт сразу в `'guest'`.
 */
function useLoadingForMs(status: SessionStatusLike): number {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const remaining = STARTUP_STALL_MS - (Date.now() - startedAt);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [status, startedAt]);
  return now - startedAt;
}

/** Предыдущее значение сети — чтобы поймать именно момент возвращения. */
function usePrevious(value: Connectivity): Connectivity {
  const ref = useRef<Connectivity>(value);
  const previous = ref.current;
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return previous;
}

function RootStackInner() {
  const { scheme, colors } = useTheme();
  const { status, user, reloadUser, retryRestore } = useSession();
  const connectivity = useConnectivity();
  const previousConnectivity = usePrevious(connectivity);
  const view = decideStartupView({ status, loadingForMs: useLoadingForMs(status) });
  const onboarding = useOnboardingGate();
  // Полноэкранный плеер Медиатеки выезжает снизу из мини-плеера; при
  // «уменьшить движение» — проявляется на месте (VED-331).
  const reducedMotion = useReducedMotion();
  // Закреплённое для панели быстрого доступа (VED-385) читается вместе с
  // восстановлением сессии, а не когда откроются вкладки: вкладки ждут этого
  // чтения, чтобы первый кадр сразу встал с панелью (`(tabs)/_layout.tsx`).
  useEffect(() => {
    void quickPinsStore.load();
  }, []);

  // «Повторить» на экране «Нет соединения»: кнопка занята, пока не пройдёт
  // ещё один срок ожидания или сессия не решится (экран тогда уйдёт сам).
  const [retrying, setRetrying] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setRetrying(true);
    retryRestore();
    retryTimer.current = setTimeout(() => setRetrying(false), STARTUP_STALL_MS);
  }, [retryRestore]);
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // Сеть вернулась: на экране повтора — повторяем сами; во вкладках без
  // профиля (пустили без сети) — догружаем профиль.
  useEffect(() => {
    if (shouldAutoRetryRestore({ view, previous: previousConnectivity, current: connectivity })) retry();
    if (shouldReloadProfile({ status, hasUser: Boolean(user), previous: previousConnectivity, current: connectivity })) {
      reloadUser().catch(() => undefined);
    }
  }, [connectivity, previousConnectivity, view, status, user, retry, reloadUser]);

  if (view === 'splash') return <View style={{ flex: 1, backgroundColor: colors.bg0 }} />;
  if (view === 'stalled') {
    return (
      <>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <StartupOfflineScreen connectivity={connectivity} retrying={retrying} onRetry={retry} />
      </>
    );
  }
  return (
    <OfflineBannerFrame visible={shouldShowOfflineBanner({ status, connectivity })}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <PushBridge />
      {/* Возврат в конференцию после входа (VED-360): здесь по той же
          причине, что и PushBridge, — намерение надо подхватить, как только
          сессия стала «вошёл», на каком бы экране человек ни оказался. */}
      <ConferenceReturn />
      <TelegramShell />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg0 } }}>
        <Stack.Protected guard={status === 'guest'}>
          <Stack.Screen name="login" />
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={onboarding.visible}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signed' && !onboarding.visible}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          {/* «Профиль» (VED-332) — маршрут корневого стека рядом с
              «Аккаунтом», а не шестая вкладка: заходят туда редко, зато из
              двух мест — карточкой сверху «Аккаунта» и своей карточкой в
              справочнике людей. */}
          <Stack.Screen name="profile" />
          {/* Поиск по порталу (VED-337) — маршрут корневого стека: выдача на
              весь экран поверх вкладок, вход — полем в шапке «Сервисов». */}
          <Stack.Screen name="search" />
          {/* Лента уведомлений (VED-330) — маршрут корневого стека, а не
              шестая вкладка внизу: вход в неё один, колокольчиком в шапке
              «Чатов» (`components/notifications/notification-bell.tsx`).
              Сюда же приземляются пуши о разделах, которых в приложении
              нет, — раньше они вели на список чатов. */}
          <Stack.Screen name="notifications" />
          {/* Поддержка (VED-336) — те же обращения, что на сайте, своими
              экранами. Вход — строкой «Поддержка» в «Аккаунте» и кнопкой
              «Написать в поддержку» в состояниях ошибки; сюда же ведёт пуш
              «Ответ поддержки». */}
          <Stack.Screen name="support/index" />
          <Stack.Screen name="support/new" />
          <Stack.Screen name="support/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="chat/requests" />
          {/* Создание групп и каналов и управление участниками (VED-292) —
              то же, что умеют формы `/chat/new` и `/chat/[id]/members` на
              сайте. Новых ручек на сервере под это не заводилось. */}
          <Stack.Screen name="chat/new" />
          <Stack.Screen name="chat/members/[id]" />
          {/* Панель конференции (VED-360): срок ссылки, отправка, «закрыть
              вход» и «выдать новую». Полулистом, а не полосой в комнате:
              нужна редко, а «закрыть вход» без второй кнопки необратимо —
              пусть у решения будет своя страница и пауза перед нажатием. */}
          <Stack.Screen
            name="conference/[id]"
            options={{ presentation: 'formSheet', sheetGrabberVisible: true }}
          />
          {/* Сканер состава «Здоровья» (VED-335) — маршруты корневого стека,
              а не шестая вкладка: вход в него один, карточкой сервиса на
              вкладке «Сервисы», и держать ради него постоянную кнопку внизу
              незачем. Экран ответа берёт штрихкод из адреса, а не из памяти
              сканера: так в него возвращаются из истории и попадают по
              ссылке, а вердикт всегда пересчитывается заново. */}
          {/* Раздел «Здоровье» (VED-335): вход в сервис открывает ярлыки
              средств, а не сразу сканер — сканер одно из них. */}
          <Stack.Screen name="wellness/index" />
          <Stack.Screen name="wellness/scan" />
          <Stack.Screen name="wellness/result/[barcode]" />
          {/* Съёмка состава, когда товара нет в базе: «не найдено» перестаёт
              быть тупиком и становится путём пополнения базы. Штрихкод в
              адресе — к нему и привяжется новая карточка. */}
          <Stack.Screen name="wellness/label/[barcode]" />
          <Stack.Screen name="wellness/history" />
          {/* Блог-лента (VED-334) — маршруты корневого стека, а не шестая
              вкладка: начало ленты стоит полосой в «Чатах»
              (`components/blog/blog-home-strip.tsx`), вся лента открывается
              оттуда, из карточки «Блог-лента» в «Сервисах» и чипом панели
              быстрого доступа. Экран поста берёт id из адреса — в него
              попадают и с полосы, и из ленты, и из блога автора. */}
          <Stack.Screen name="blog/index" />
          <Stack.Screen name="blog/new" />
          <Stack.Screen name="blog/post/[id]" />
          <Stack.Screen name="blog/authors/[id]" />
          {/* Медиатека (VED-331) — маршруты корневого стека, а не шестая
              вкладка: вход — карточкой «Медиатека» в «Сервисах» и чипом
              панели быстрого доступа. Сам звук живёт не в экране, а в
              провайдере (`lib/media/media-player-provider.tsx`) и не
              прерывается при уходе отсюда; мини-плеер — над вкладками. */}
          <Stack.Screen name="music/index" />
          <Stack.Screen name="music/audiobooks/[slug]" />
          {/* Полноэкранный плеер — модалью снизу вверх, как раскрытый
              мини-плеер. Свернуть — стрелкой или системным «назад». */}
          <Stack.Screen
            name="music/player"
            options={{
              presentation: 'modal',
              headerShown: false,
              animation: reducedMotion ? 'fade' : 'slide_from_bottom',
            }}
          />
          {/* Знакомства (сервис `union`) — маршруты корневого стека, а не
              шестая вкладка: вход — карточкой «Знакомства» в «Сервисах»,
              чипом панели быстрого доступа и пушем «Новая заявка». Колода
              свайпов живёт внутри экрана подбора полноэкранной накладкой, а
              не своим маршрутом: ей нужна та же выдача, что у сетки. */}
          <Stack.Screen name="union/index" />
          <Stack.Screen name="union/recommendations" />
          <Stack.Screen name="union/users/[id]" />
          <Stack.Screen name="union/likes" />
          <Stack.Screen name="union/connections" />
          <Stack.Screen name="union/report/[id]" />
          {/* Своя анкета, место жительства, подборки и скрытые — вторая
              часть переноса. Вход в раздел ведёт на место или анкету сам,
              если их ещё нет. */}
          <Stack.Screen name="union/profile" />
          <Stack.Screen name="union/location" />
          <Stack.Screen name="union/collections" />
          <Stack.Screen name="union/hidden" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="communities/[id]" />
          <Stack.Screen name="communities/new" />
          <Stack.Screen name="calls-probe" />
          {/* Экран звонка (VED-219): модалью на весь экран, без системной
              шапки и без жеста «назад» — трубку кладут кнопкой, не свайпом. */}
          <Stack.Screen
            name="call/[id]"
            options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: 'fade' }}
          />
          {/* Групповой звонок (VED-293) — тем же способом, что и звонок
              один на один: модаль на весь экран без системной шапки.
              Отличие одно: «назад» здесь СВОРАЧИВАЕТ комнату (экран сам
              перехватывает), выход — только кнопкой. */}
          <Stack.Screen
            name="group-call/[id]"
            options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: 'fade' }}
          />
        </Stack.Protected>
        {/* Ссылка на конференцию (VED-360) — ВНЕ охраны: её присылают
            человеку, у которого аккаунта может ещё не быть, и он обязан
            увидеть, кто зовёт, до входа. Единственный экран приложения,
            открытый и гостю, и вошедшему.

            Стоит ПОСЛЕДНИМ намеренно. Без ссылки (обычный запуск) гость и
            новичок в онбординге попадают на первый доступный экран стека;
            пока этот экран стоял первым, им вместо входа показывалось
            «Конференция не открылась» без токена (сборка 1026). */}
        <Stack.Screen name="j/[token]" />
      </Stack>
    </OfflineBannerFrame>
  );
}
