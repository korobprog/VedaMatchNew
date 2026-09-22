import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InlineError } from '@/components/inline-error';
import { DevicePushSection } from '@/components/notifications/device-push-section';
import { NotificationSwitchesSection } from '@/components/notifications/notification-switches-section';
import { RetryButton } from '@/components/retry-button';
import {
  accountEmailLabel,
  buildLinkUrl,
  buildProviderRows,
  linkErrorMessage,
  linkSuccessMessage,
  providerLabel,
  readLinkQuery,
  type AccountProvider,
} from '@/lib/auth/account-link';
import type { IdentitiesResponse } from '@/lib/auth/identities-api';
import { createIdentitiesApi } from '@/lib/auth/identities-api';
import { describeIdentitiesError } from '@/lib/auth/identities-error';
import { useSession } from '@/lib/auth/session';
import { createAccountDeletionApi } from '@/lib/account/deletion-api';
import { formatDeletionDate, isDeletionScheduled, type DeletionStatus } from '@/lib/account/deletion';
import { createTelegramNotificationsApi } from '@/lib/notifications/telegram-notifications-api';
import { describeTelegramNotificationsSection } from '@/lib/notifications/telegram-notifications-state';
import { loadTelegramWebApp, telegramLaunch } from '@/lib/telegram/web-app';
import { pressedStyle, ripple } from '@/theme/press';
import { buildStamp, buildStampLabel } from '@/config/build-stamp';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import type { TelegramNotificationStatusResponse } from '@vedamatch/shared';

const IS_WEB = Platform.OS === 'web';

/**
 * «Аккаунт и способы входа» (веха 3): список привязанных способов входа,
 * привязка Google/Яндекс/Telegram и отвязка. Открывается со вкладки
 * «Сервисы» (VED-379). Привязка Google/Яндекс — переход браузера на
 * `/auth/<provider>?link=1`, поэтому кнопки есть только на вебе
 * (`IS_WEB`); нативная Android-сборка показывает список и отвязку, без
 * OAuth-перехода — спецификация вехи прямо выносит это за скобки.
 */
export default function AccountScreen() {
  const { colors } = useTheme();
  const stamp = buildStampLabel(buildStamp());
  const insets = useSafeAreaInsets();
  const { user, api, apiOrigin, signOut } = useSession();
  const identitiesApi = useMemo(() => createIdentitiesApi(api), [api]);
  const telegramNotificationsApi = useMemo(() => createTelegramNotificationsApi(api), [api]);
  const deletionApi = useMemo(() => createAccountDeletionApi(api), [api]);

  const [data, setData] = useState<IdentitiesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busyProvider, setBusyProvider] = useState<AccountProvider | null>(null);
  const request = useRef(0);

  // Секция «Уведомления в Telegram» (веха 4): загружается независимо от
  // способов входа — `null` отличает «ещё не знаем» от «бот не подключён».
  const [telegramStatus, setTelegramStatus] = useState<TelegramNotificationStatusResponse | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const telegramRequest = useRef(0);

  // Раздел «Удаление аккаунта» (внизу экрана): состояние загружается
  // независимо от способов входа, тем же приёмом, что и статус Telegram —
  // `null` значит «ещё не знаем», отдельная ошибка не блокирует остальной
  // экран.
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus | null>(null);
  const [deletionLoadError, setDeletionLoadError] = useState<string | null>(null);
  const [deletionActionError, setDeletionActionError] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionConfirmVisible, setDeletionConfirmVisible] = useState(false);
  const deletionRequest = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const response = await identitiesApi.list();
      if (request.current === id) {
        setData(response);
        setLoadError(null);
      }
    } catch (e) {
      if (request.current === id) setLoadError(describeIdentitiesError(e));
    } finally {
      if (request.current === id) setRetrying(false);
    }
  }, [identitiesApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTelegramStatus = useCallback(async () => {
    const id = (telegramRequest.current += 1);
    try {
      const response = await telegramNotificationsApi.status();
      if (telegramRequest.current === id) setTelegramStatus(response);
    } catch {
      // Молчаливый отказ: секция ниже способов входа необязательна для
      // страницы целиком, а неудачную загрузку статуса покажет попытка
      // тумблера или кнопки, если человек до них дойдёт.
    }
  }, [telegramNotificationsApi]);

  useEffect(() => {
    void loadTelegramStatus();
  }, [loadTelegramStatus]);

  const loadDeletionStatus = useCallback(async () => {
    const id = (deletionRequest.current += 1);
    try {
      const response = await deletionApi.status();
      if (deletionRequest.current === id) {
        setDeletionStatus(response);
        setDeletionLoadError(null);
      }
    } catch (e) {
      if (deletionRequest.current === id) setDeletionLoadError(describeIdentitiesError(e));
    }
  }, [deletionApi]);

  useEffect(() => {
    void loadDeletionStatus();
  }, [loadDeletionStatus]);

  const requestAccountDeletion = useCallback(async () => {
    setDeletionBusy(true);
    setDeletionActionError(null);
    try {
      setDeletionStatus(await deletionApi.request());
      setDeletionConfirmVisible(false);
    } catch (e) {
      setDeletionActionError(describeIdentitiesError(e));
    } finally {
      setDeletionBusy(false);
    }
  }, [deletionApi]);

  const cancelAccountDeletion = useCallback(async () => {
    setDeletionBusy(true);
    setDeletionActionError(null);
    try {
      setDeletionStatus(await deletionApi.cancel());
    } catch (e) {
      setDeletionActionError(describeIdentitiesError(e));
    } finally {
      setDeletionBusy(false);
    }
  }, [deletionApi]);

  // Возврат с колбэка привязки (`?linked=google` / `?linkError=conflict`):
  // только веб, только один раз — адрес чистится сразу, иначе обновление
  // страницы показало бы баннер снова.
  useEffect(() => {
    if (!IS_WEB || typeof window === 'undefined') return;
    const result = readLinkQuery(window.location.search);
    if (result.kind === 'none') return;
    setNotice(
      result.kind === 'linked'
        ? { kind: 'success', text: linkSuccessMessage(result.provider) }
        : { kind: 'error', text: linkErrorMessage(result.code) },
    );
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const retry = useCallback(() => {
    setRetrying(true);
    void load();
  }, [load]);

  const startLink = useCallback(
    async (provider: 'google' | 'yandex') => {
      if (!IS_WEB || typeof window === 'undefined') return;
      setBusyProvider(provider);
      try {
        // Access-токен живёт 15 минут (см. CLAUDE.md); человек мог долго
        // читать этот экран перед нажатием «Привязать». Лёгкий запрос перед
        // переходом заставляет `ApiClient` самому обновить cookie на 401
        // (`session.refresh()`), пока сервер ещё не проверил её на старте
        // привязки (`GET /auth/<provider>?link=1`, раунд оценки вехи 3, п.3) —
        // без этого истёкший токен привёл бы к `?linkError=session` даже с
        // живым `refresh_token`.
        await api.request('/users/me');
      } catch {
        // Не получилось (сеть, сессия правда мертва) — переход всё равно
        // случится, а сервер вернёт понятный `?linkError=session`, если
        // окажется, что сессии больше нет.
      }
      window.location.assign(buildLinkUrl(apiOrigin, provider, window.location.origin, '/account'));
    },
    [api, apiOrigin],
  );

  const linkTelegram = useCallback(async () => {
    if (!telegramLaunch) return;
    setBusyProvider('telegram');
    setActionError(null);
    try {
      await identitiesApi.linkTelegram(telegramLaunch.initData);
      setNotice({ kind: 'success', text: linkSuccessMessage('telegram') });
      await load();
    } catch (e) {
      setActionError(describeIdentitiesError(e));
    } finally {
      setBusyProvider(null);
    }
  }, [identitiesApi, load]);

  const unlink = useCallback(
    async (provider: AccountProvider) => {
      setBusyProvider(provider);
      setActionError(null);
      try {
        await identitiesApi.unlink(provider);
        setNotice(null);
        await load();
      } catch (e) {
        setActionError(describeIdentitiesError(e));
      } finally {
        setBusyProvider(null);
      }
    },
    [identitiesApi, load],
  );

  const toggleTelegramNotifications = useCallback(
    async (enabled: boolean) => {
      setTelegramBusy(true);
      setTelegramError(null);
      try {
        setTelegramStatus(await telegramNotificationsApi.setEnabled(enabled));
      } catch (e) {
        setTelegramError(describeIdentitiesError(e));
      } finally {
        setTelegramBusy(false);
      }
    },
    [telegramNotificationsApi],
  );

  /**
   * «Разрешить боту писать мне»: только внутри мини-приложения. Telegram
   * отдаёт согласие колбэком, а не промисом (`WebApp.requestWriteAccess`,
   * Bot API 6.9+) — на клиентах старее метода нет вовсе, отсюда проверка
   * перед вызовом, а не просто «ничего не произойдёт».
   */
  const enableTelegramNotifications = useCallback(async () => {
    if (!telegramLaunch) return;
    setTelegramBusy(true);
    setTelegramError(null);
    try {
      const app = await loadTelegramWebApp();
      if (!app?.requestWriteAccess) {
        setTelegramError('Обновите Telegram до последней версии и попробуйте снова.');
        return;
      }
      const granted = await new Promise<boolean>((resolve) => app.requestWriteAccess!(resolve));
      if (!granted) {
        setTelegramError('Доступ не выдан — боту нечем будет написать.');
        return;
      }
      setTelegramStatus(await telegramNotificationsApi.enable(telegramLaunch.initData));
    } catch (e) {
      setTelegramError(describeIdentitiesError(e));
    } finally {
      setTelegramBusy(false);
    }
  }, [telegramNotificationsApi]);

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Аккаунт',
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
      }}
    />
  );

  if (!data && loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.center}>
          <InlineError message={loadError} />
          <RetryButton onPress={retry} busy={retrying} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.text1} />
        </View>
      </View>
    );
  }

  const rows = buildProviderRows(data.identities);
  // Служебный адрес Telegram (`tg-<id>@users.vedamatch.invalid`) человеку
  // не показываем — только факт, что почты нет (раунд оценки вехи 3, п.5).
  const emailLabel = accountEmailLabel(user?.email, data.placeholderEmail);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {/* Вход в профиль (VED-332). Карточка была неинтерактивной: человек
            видел своё имя и не мог его поправить — поменять о себе хоть
            что-то в приложении было негде вовсе. Имя здесь — `displayName`,
            то есть духовное, если оно заполнено: карточка показывает
            человека, а не служебное поле анкеты. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Профиль, ${user?.displayName ?? 'аккаунт'}`}
          accessibilityHint="Имя, духовное имя, фотография и рассказ о себе"
          onPress={() => router.push('/profile')}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.profile,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder },
            pressedStyle(pressed),
          ]}
        >
          <ChatAvatar
            id={user?.id ?? 'me'}
            name={user?.displayName ?? 'Аккаунт'}
            uri={user?.avatarUrl}
            size={52}
          />
          <View style={styles.profileBody}>
            <Text numberOfLines={1} style={[styles.profileName, { color: colors.text0 }]}>
              {user?.displayName ?? 'Аккаунт'}
            </Text>
            {emailLabel ? (
              <Text
                numberOfLines={1}
                style={[styles.profileEmail, { color: data.placeholderEmail ? colors.text2 : colors.text1 }]}
              >
                {emailLabel}
              </Text>
            ) : null}
            <Text style={[styles.profileHint, { color: colors.text1 }]}>Имя, фотография, о себе</Text>
          </View>
        </Pressable>

        {data.placeholderEmail ? (
          <Text
            accessibilityRole="alert"
            style={[styles.hint, { color: colors.text0, backgroundColor: colors.bg1, borderColor: colors.gold }]}
          >
            Telegram не сообщает почту — привяжите Google или Яндекс, чтобы не потерять доступ к аккаунту.
          </Text>
        ) : null}

        {notice ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[
              styles.hint,
              {
                color: colors.text0,
                backgroundColor: colors.bg1,
                borderColor: notice.kind === 'success' ? colors.cyan : colors.magenta,
              },
            ]}
          >
            {notice.text}
          </Text>
        ) : null}

        {loadError ? <InlineError message={loadError} /> : null}
        {actionError ? <InlineError message={actionError} /> : null}

        <View style={styles.list}>
          {rows.map((row) => (
            <ProviderRowView
              key={row.provider}
              row={row}
              busy={busyProvider === row.provider}
              onLink={linkActionFor(row.provider, {
                google: () => void startLink('google'),
                yandex: () => void startLink('yandex'),
                telegram: () => void linkTelegram(),
              })}
              onUnlink={() => unlink(row.provider)}
            />
          ))}
        </View>

        {/* Уведомления самого устройства. В веб-сборке — веб-пуши через
            сервис-воркер (VED-313), в нативной — честное состояние доставки
            через Firebase: работает ли она, а если нет, то почему и что
            сделать (VED-329). Разные файлы рядом, Metro выбирает по
            платформе. */}
        <DevicePushSection />

        {/* О чём уведомлять: «Сообщения» и «Звонки» порознь (VED-361).
            Остальные категории остаются на сайте — сюда вынесены те два
            тумблера, ради которых человек и открывает настройки на телефоне. */}
        <NotificationSwitchesSection />

        <TelegramNotificationsSection
          connected={telegramStatus?.connected ?? false}
          enabled={telegramStatus?.enabled ?? true}
          busy={telegramBusy}
          error={telegramError}
          onToggle={(next) => void toggleTelegramNotifications(next)}
          onEnable={() => void enableTelegramNotifications()}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.logout, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.logoutText, { color: colors.text0 }]}>Выйти</Text>
        </Pressable>

        <DeletionSection
          status={deletionStatus}
          loadError={deletionLoadError}
          actionError={deletionActionError}
          busy={deletionBusy}
          onRequest={() => setDeletionConfirmVisible(true)}
          onCancel={() => void cancelAccountDeletion()}
        />

        <ConfirmDialog
          visible={deletionConfirmVisible}
          title="Удалить аккаунт?"
          message="Профиль скроется от других участников. Удаление станет окончательным через 14 дней — до этого момента его можно отменить здесь же."
          confirmLabel="Удалить"
          destructive
          busy={deletionBusy}
          onConfirm={() => void requestAccountDeletion()}
          onCancel={() => setDeletionConfirmVisible(false)}
        />

        {/* Видно, свежая ли открылась сборка: в мини-приложении Telegram и в
            установленном на экран «Домой» PWA страница может прийти из кэша. */}
        {stamp ? (
          <Text style={[styles.stamp, { color: colors.text2 }]} accessibilityRole="text">
            {stamp}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Обработчик «Привязать» для строки провайдера. Раньше выбирался через
 * `row.provider === 'telegram' ? linkTelegram : () => startLink(row.provider
 * as 'google' | 'yandex')` — `as` без проверки в рантайме молча соврал бы,
 * добавь `ACCOUNT_PROVIDERS` четвёртого провайдера (раунд оценки вехи 3,
 * п.6). Switch без `default` и присваивание `never` в конце делают то же
 * самое компромисс-стойкой ошибкой компиляции, а не тихим багом в рантайме.
 */
function linkActionFor(
  provider: AccountProvider,
  handlers: { google(): void; yandex(): void; telegram(): void },
): () => void {
  switch (provider) {
    case 'google':
      return handlers.google;
    case 'yandex':
      return handlers.yandex;
    case 'telegram':
      return handlers.telegram;
    default: {
      const exhaustive: never = provider;
      throw new Error(`Неизвестный способ входа: ${String(exhaustive)}`);
    }
  }
}

interface ProviderRowProps {
  row: { provider: AccountProvider; linked: boolean; canUnlink: boolean };
  busy: boolean;
  onLink(): void;
  onUnlink(): void;
}

/**
 * Строка одного способа входа: имя, состояние и кнопка «Привязать»/
 * «Отвязать». Последний способ отвязать нельзя — кнопки нет, вместо неё
 * объяснение; Google/Яндекс на нативной сборке — то же самое: OAuth-переход
 * есть только в браузере (`IS_WEB`).
 */
function ProviderRowView({ row, busy, onLink, onUnlink }: ProviderRowProps) {
  const { colors } = useTheme();
  const label = providerLabel(row.provider);
  const canStartLink = row.provider === 'telegram' ? Boolean(telegramLaunch) : IS_WEB;

  let action: { text: string; onPress: () => void; disabled?: boolean } | null = null;
  let note: string | null = null;

  if (row.linked) {
    if (row.canUnlink) {
      action = { text: 'Отвязать', onPress: onUnlink };
    } else {
      note = 'Последний способ входа — сначала привяжите другой.';
    }
  } else if (canStartLink) {
    action = { text: 'Привязать', onPress: onLink };
  } else if (row.provider === 'telegram') {
    note = 'Откройте VedaMatch в Telegram через @vedamatch_bot, чтобы привязать Telegram.';
  } else {
    note = 'Доступно в веб-версии VedaMatch в браузере.';
  }

  return (
    <View style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.glass }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.text0 }]}>{label}</Text>
        <Text style={[styles.rowState, { color: row.linked ? colors.cyan : colors.text1 }]}>
          {row.linked ? 'Привязан' : 'Не привязан'}
        </Text>
        {note ? <Text style={[styles.rowNote, { color: colors.text2 }]}>{note}</Text> : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={action.onPress}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.rowButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          {busy ? <ActivityIndicator color={colors.text0} /> : <Text style={[styles.rowButtonText, { color: colors.text0 }]}>{action.text}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

interface TelegramNotificationsSectionProps {
  connected: boolean;
  enabled: boolean;
  busy: boolean;
  error: string | null;
  onToggle(next: boolean): void;
  onEnable(): void;
}

/**
 * «Уведомления в Telegram» (веха 4): тумблер, если бот уже может писать
 * (`connected`); внутри мини-приложения без разрешения — кнопка запроса
 * доступа; вне Telegram без разрешения — подсказка открыть бота.
 * `describeTelegramNotificationsSection` — чистое правило, своя `*.spec.ts`.
 */
function TelegramNotificationsSection({
  connected,
  enabled,
  busy,
  error,
  onToggle,
  onEnable,
}: TelegramNotificationsSectionProps) {
  const { colors } = useTheme();
  const section = describeTelegramNotificationsSection({
    inTelegram: Boolean(telegramLaunch),
    connected,
  });

  return (
    <View style={styles.telegramSection}>
      <Text style={[styles.sectionTitle, { color: colors.text1 }]}>Уведомления в Telegram</Text>
      {/* Кнопка с длинной подписью рядом с текстом сжимала его в узкую колонку
          с переносами посреди слов — тогда карточка раскладывается в столбец. */}
      <View
        style={[
          styles.row,
          section.showEnableButton && !section.showToggle ? styles.rowStacked : null,
          { borderColor: colors.glassBorder, backgroundColor: colors.glass },
        ]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: colors.text0 }]}>Сообщения от @vedamatch_bot</Text>
          <Text style={[styles.rowNote, { color: colors.text2 }]}>
            {section.showToggle
              ? 'Личные сообщения и звонки со ссылкой в переписку.'
              : (section.hint ?? 'Разрешите боту писать вам, чтобы получать уведомления здесь.')}
          </Text>
        </View>
        {section.showToggle ? (
          <Switch
            accessibilityRole="switch"
            accessibilityLabel="Получать уведомления от бота VedaMatch в Telegram"
            accessibilityState={{ disabled: busy, checked: enabled }}
            disabled={busy}
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: colors.glassBorder, true: colors.cyan }}
            thumbColor={colors.onAccent}
          />
        ) : section.showEnableButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onEnable}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.rowButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text0} />
            ) : (
              <Text style={[styles.rowButtonText, { color: colors.text0 }]}>Разрешить боту писать мне</Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

interface DeletionSectionProps {
  status: DeletionStatus | null;
  loadError: string | null;
  actionError: string | null;
  busy: boolean;
  onRequest(): void;
  onCancel(): void;
}

/**
 * «Удаление аккаунта» — самый низ экрана, отдельно от остальных настроек.
 * Зеркалит веб (`delete-account-section.tsx`): без запроса — объяснение и
 * кнопка, открывающая `ConfirmDialog` (не `Alert.alert` — тот на вебе и в
 * Telegram Mini App не срабатывает, см. комментарий в `confirm-dialog.tsx`);
 * с запросом — дата, до которой ещё можно отменить.
 */
function DeletionSection({ status, loadError, actionError, busy, onRequest, onCancel }: DeletionSectionProps) {
  const { colors } = useTheme();
  const scheduled = status ? isDeletionScheduled(status) : false;

  return (
    <View style={[styles.dangerZone, { borderColor: colors.magenta }]}>
      <Text style={[styles.sectionTitle, { color: colors.magenta }]}>Удаление аккаунта</Text>

      {loadError ? (
        <InlineError message={loadError} />
      ) : !status ? (
        <ActivityIndicator color={colors.text1} />
      ) : scheduled ? (
        <>
          <Text style={[styles.dangerText, { color: colors.text0 }]}>
            Аккаунт будет удалён
            {status.deletionEligibleAt ? ` ${formatDeletionDate(status.deletionEligibleAt)}` : ''}.
          </Text>
          <Text style={[styles.rowNote, { color: colors.text2 }]}>
            До этой даты можно отменить удаление — профиль и все данные останутся как есть.
          </Text>
          {actionError ? <InlineError message={actionError} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onCancel}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [styles.dangerButton, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text0} />
            ) : (
              <Text style={[styles.rowButtonText, { color: colors.text0 }]}>Отменить удаление</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.dangerText, { color: colors.text1 }]}>
            Профиль скроется от других участников. Через 14 дней после запроса аккаунт удаляется
            окончательно — до этого момента удаление можно отменить.
          </Text>
          {actionError ? <InlineError message={actionError} /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={onRequest}
            android_ripple={ripple(colors.magenta)}
            style={({ pressed }) => [styles.dangerButton, { borderColor: colors.magenta }, pressedStyle(pressed)]}
          >
            {busy ? (
              <ActivityIndicator color={colors.magenta} />
            ) : (
              <Text style={[styles.rowButtonText, { color: colors.magenta }]}>Удалить аккаунт</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 16,
    overflow: 'hidden',
  },
  profileBody: { flex: 1, minWidth: 0, gap: 2 },
  profileName: { fontFamily: fonts.bodyBold, fontSize: 18 },
  profileEmail: { fontFamily: fonts.body, fontSize: 13 },
  profileHint: { fontFamily: fonts.body, fontSize: 13 },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    overflow: 'hidden',
  },
  list: { gap: 10 },
  telegramSection: { gap: 8, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    minHeight: hitTarget,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  rowState: { fontFamily: fonts.body, fontSize: 13 },
  rowNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowButton: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  logout: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    overflow: 'hidden',
  },
  stamp: { fontFamily: fonts.body, fontSize: 12, textAlign: 'center', marginTop: 12 },
  logoutText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  dangerZone: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    gap: 8,
    marginTop: 16,
  },
  dangerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  dangerButton: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
