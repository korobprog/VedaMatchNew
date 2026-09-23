import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ConferenceReturn } from '@/components/chat/conference-return';
import { useSession } from '@/lib/auth/session';
import { OnboardingGateProvider, useOnboardingGate } from '@/lib/onboarding/onboarding-gate';
import { PushBridge } from '@/lib/push/push-bridge';
import { quickPinsStore } from '@/lib/services/quick-pins-store';
import { TelegramShell } from '@/lib/telegram/telegram-shell';
import { useTheme } from '@/theme/theme';

/**
 * Стек экранов — общий для `root-shell.tsx` (телефон) и `root-shell.web.tsx`
 * (браузер): список экранов один, платформы расходятся только в наборе
 * провайдеров (`RootProviders`), см. оба файла.
 *
 * Гость видит только экран входа, вошедший — только вкладки. Пока сессия
 * восстанавливается, не показываем ничего: мигание экрана входа перед чатами
 * выглядит как разлогин.
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

function RootStackInner() {
  const { scheme, colors } = useTheme();
  const { status } = useSession();
  const onboarding = useOnboardingGate();
  // Закреплённое для панели быстрого доступа (VED-385) читается вместе с
  // восстановлением сессии, а не когда откроются вкладки: вкладки ждут этого
  // чтения, чтобы первый кадр сразу встал с панелью (`(tabs)/_layout.tsx`).
  useEffect(() => {
    void quickPinsStore.load();
  }, []);
  if (status === 'loading') return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <PushBridge />
      {/* Возврат в конференцию после входа (VED-360): здесь по той же
          причине, что и PushBridge, — намерение надо подхватить, как только
          сессия стала «вошёл», на каком бы экране человек ни оказался. */}
      <ConferenceReturn />
      <TelegramShell />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg0 } }}>
        {/* Ссылка на конференцию (VED-360) — ВНЕ охраны: её присылают
            человеку, у которого аккаунта может ещё не быть, и он обязан
            увидеть, кто зовёт, до входа. Единственный экран приложения,
            открытый и гостю, и вошедшему. */}
        <Stack.Screen name="j/[token]" />
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
      </Stack>
    </>
  );
}
