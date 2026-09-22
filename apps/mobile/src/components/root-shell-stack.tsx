import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ConferenceReturn } from '@/components/chat/conference-return';
import { useSession } from '@/lib/auth/session';
import { OnboardingGateProvider, useOnboardingGate } from '@/lib/onboarding/onboarding-gate';
import { PushBridge } from '@/lib/push/push-bridge';
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
          {/* Лента уведомлений (VED-330) — маршрут корневого стека, а не
              шестая вкладка внизу: вход в неё один, колокольчиком в шапке
              «Чатов» (`components/notifications/notification-bell.tsx`).
              Сюда же приземляются пуши о разделах, которых в приложении
              нет, — раньше они вели на список чатов. */}
          <Stack.Screen name="notifications" />
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
          <Stack.Screen name="wellness/scan" />
          <Stack.Screen name="wellness/result/[barcode]" />
          <Stack.Screen name="wellness/history" />
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
