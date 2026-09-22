import type { UserProfile } from '@vedamatch/shared';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from '@/components/chat/chat-avatar';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { AvatarSheet } from '@/components/profile/avatar-sheet';
import { RetryButton } from '@/components/retry-button';
import { useSession } from '@/lib/auth/session';
import { confirmTap } from '@/lib/feedback';
import {
  avatarDenialMessage,
  normalizePickedAvatar,
  validateAvatar,
  type AvatarCandidate,
} from '@/lib/profile/avatar-rules';
import { createProfileApi, describeProfileError } from '@/lib/profile/profile-api';
import {
  PROFILE_FIELD_LIMITS,
  buildProfileUpdate,
  displayNamePreview,
  findProfileError,
  hasProfileChanges,
  profileFormValues,
  remainingChars,
  shouldShowCounter,
  type ProfileFieldName,
  type ProfileFormValues,
} from '@/lib/profile/profile-fields';
import { buildUploadFormPart } from '@/lib/upload/upload-form-part';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * «Профиль» (VED-332).
 *
 * До него человек, зарегистрировавшийся в приложении, не мог оформить себя
 * никак: «Аккаунт» умел только способы входа, уведомления, выход и удаление,
 * а имя и фотографию видят все — в переписке, в справочнике людей, в
 * общинах. Поэтому экран начинается не с формы, а с предпросмотра: сверху
 * стоит ровно то, что увидит другой участник, и уже под ним — поля.
 *
 * Серверного кода экран не добавил: `PATCH /profile` и
 * `POST|DELETE /profile/avatar` — те же ручки, которыми правит профиль сайт
 * (`apps/web/src/components/profile-editor.tsx`), и `AuthGuard` принимает
 * Bearer наравне с его cookie.
 *
 * Полей четыре: имя, духовное имя, статус, рассказ о себе — всё, что видно
 * другим и правится одним текстовым полем. Город (геокодер), языки
 * (справочник) и тринадцать полей контактов остались на сайте, и внизу об
 * этом сказано прямо. Почему именно так — в `lib/profile/profile-fields.ts`.
 *
 * Имя наружу — правило портала (CLAUDE.md): заполненное духовное имя
 * перекрывает мирское. Предпросмотр считает его той же `resolveDisplayName`,
 * что и сервер, а подпись под полем говорит об этом словами — иначе человек
 * заполняет духовное имя и не понимает, куда делось мирское.
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, reloadUser } = useSession();
  const profileApi = useMemo(() => createProfileApi(api), [api]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [values, setValues] = useState<ProfileFormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<ProfileFieldName | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  /** Локальный файл, пока он грузится: лицо видно сразу, а не после ответа сервера. */
  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);

  // Несколько загрузок могут перекрыться (возврат «Повторить» поверх
  // медленного первого запроса) — засчитывается самая свежая. Тот же приём,
  // что на «Аккаунте» и в ленте уведомлений.
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = (request.current += 1);
    try {
      const response = await profileApi.me();
      if (request.current !== id) return;
      setProfile(response);
      // Форма перезаполняется только при загрузке профиля с сервера:
      // затирать набранное после каждого ответа значило бы терять правку,
      // которую человек делал, пока шёл запрос.
      setValues(profileFormValues(response));
      setLoadError(null);
    } catch (e) {
      if (request.current === id) setLoadError(describeProfileError(e, 'Не удалось загрузить профиль.'));
    } finally {
      if (request.current === id) setRetrying(false);
    }
  }, [profileApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setRetrying(true);
    void load();
  }, [load]);

  /** Ответ сервера — единственный источник состояния после изменения. */
  const applyUpdated = useCallback(
    (updated: UserProfile) => {
      setProfile(updated);
      setValues(profileFormValues(updated));
      // Сессия помнит имя и аватар: без этого «Аккаунт» и шапки продолжали
      // бы показывать прежние до перезапуска приложения.
      void reloadUser().catch(() => undefined);
    },
    [reloadUser],
  );

  const save = useCallback(async () => {
    if (!profile || !values || saving) return;
    setNotice(null);
    setSaveError(null);
    setInvalidField(null);

    const error = findProfileError(values);
    if (error) {
      setInvalidField(error.field);
      setSaveError(error.message);
      return;
    }
    if (!hasProfileChanges(values, profile)) {
      setNotice('Изменений нет — сохранять нечего.');
      return;
    }

    setSaving(true);
    try {
      const updated = await profileApi.update(buildProfileUpdate(values, profile));
      applyUpdated(updated);
      setNotice('Профиль сохранён.');
      confirmTap();
    } catch (e) {
      setSaveError(describeProfileError(e));
    } finally {
      setSaving(false);
    }
  }, [applyUpdated, profile, profileApi, saving, values]);

  const uploadAvatar = useCallback(
    async (candidate: AvatarCandidate) => {
      const denial = validateAvatar(candidate);
      if (denial) {
        setAvatarError(avatarDenialMessage(denial));
        return;
      }
      setAvatarError(null);
      setPendingAvatarUri(candidate.uri);
      setAvatarBusy(true);
      try {
        // Байты, а не `{uri,name,type}`: `expo`-fetch отвергает вторую форму
        // («Unsupported FormDataPart implementation») — ровно та ловушка,
        // из-за которой не уходили вложения переписки, разбор в
        // `lib/upload/upload-form-part.ts`. Путь отправки в приложении один.
        const form = new FormData();
        form.append('file', (await buildUploadFormPart(candidate)) as unknown as Blob);
        applyUpdated(await profileApi.uploadAvatar(form));
        setNotice('Фотография обновлена.');
        confirmTap();
      } catch (e) {
        setAvatarError(describeProfileError(e, 'Не удалось загрузить фотографию.'));
      } finally {
        setAvatarBusy(false);
        setPendingAvatarUri(null);
      }
    },
    [applyUpdated, profileApi],
  );

  const pickFromGallery = useCallback(async () => {
    setAvatarError(null);
    setNotice(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      // Обрезка — системная, а не своя: квадрат нужен потому, что аватар
      // всюду показывается квадратом со скруглением (`ChatAvatar`), и
      // выбранное «по грудь» иначе обрезалось бы по центру уже на показе.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const candidate = asset ? normalizePickedAvatar(asset) : null;
    if (!candidate) {
      setAvatarError('Не удалось определить тип фото.');
      return;
    }
    await uploadAvatar(candidate);
  }, [uploadAvatar]);

  const pickFromCamera = useCallback(async () => {
    setAvatarError(null);
    setNotice(null);
    // Разрешение спрашивается в момент, когда камера нужна, а не при запуске
    // приложения — тот же порядок, что у вложений переписки.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setAvatarError('Нет доступа к камере. Разрешите доступ в настройках телефона.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const candidate = asset ? normalizePickedAvatar(asset) : null;
    if (!candidate) {
      setAvatarError('Не удалось получить фото с камеры.');
      return;
    }
    await uploadAvatar(candidate);
  }, [uploadAvatar]);

  const removeAvatar = useCallback(async () => {
    setAvatarError(null);
    setNotice(null);
    setAvatarBusy(true);
    try {
      applyUpdated(await profileApi.deleteAvatar());
      setNotice('Фотография убрана.');
    } catch (e) {
      setAvatarError(describeProfileError(e, 'Не удалось убрать фотографию.'));
    } finally {
      setAvatarBusy(false);
    }
  }, [applyUpdated, profileApi]);

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: 'Профиль',
        headerStyle: { backgroundColor: colors.bg0 },
        headerTintColor: colors.text0,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
      }}
    />
  );

  if (!profile || !values) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
        {header}
        <View style={styles.center}>
          {loadError ? (
            <>
              <InlineError message={loadError} />
              <RetryButton onPress={retry} busy={retrying} />
            </>
          ) : (
            <ActivityIndicator color={colors.text1} />
          )}
        </View>
      </View>
    );
  }

  const shownName = displayNamePreview(values);
  const avatarUri = pendingAvatarUri ?? profile.avatarUrl;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      {header}
      <KeyboardAwareScrollView
        bottomOffset={160}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.preview, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text accessibilityRole="header" style={[styles.previewTitle, { color: colors.text1 }]}>
            Так вас видят другие
          </Text>
          <View style={styles.previewRow}>
            <View>
              <ChatAvatar id={profile.id} name={shownName} uri={avatarUri} size={72} />
              {avatarBusy ? (
                <View style={[styles.avatarBusy, { backgroundColor: colors.scrim }]}>
                  <ActivityIndicator color={colors.onAccent} />
                </View>
              ) : null}
            </View>
            <View style={styles.previewBody}>
              <Text numberOfLines={2} style={[styles.previewName, { color: colors.text0 }]}>
                {shownName || 'Без имени'}
              </Text>
              {values.statusLine.trim() ? (
                <Text numberOfLines={2} style={[styles.previewStatus, { color: colors.text1 }]}>
                  {values.statusLine.trim()}
                </Text>
              ) : null}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={profile.avatarUrl ? 'Сменить фотографию' : 'Добавить фотографию'}
            accessibilityState={{ busy: avatarBusy, disabled: avatarBusy }}
            disabled={avatarBusy}
            onPress={() => setSheetVisible(true)}
            android_ripple={ripple(colors.glassBorder)}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: colors.glassBorder, backgroundColor: colors.bg1 },
              avatarBusy ? styles.busy : pressedStyle(pressed),
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text0 }]}>
              {profile.avatarUrl ? 'Сменить фотографию' : 'Добавить фотографию'}
            </Text>
          </Pressable>

          {avatarError ? <InlineError message={avatarError} /> : null}
        </View>

        <Field
          label="Имя"
          value={values.name}
          onChange={(name) => setValues((current) => (current ? { ...current, name } : current))}
          limit={PROFILE_FIELD_LIMITS.name}
          editable={!saving}
          invalid={invalidField === 'name'}
          placeholder="Как вас зовут"
          hint="Мирское имя. Его видит администрация и поддержка; остальным показывается духовное, если оно заполнено."
        />

        <Field
          label="Духовное имя"
          value={values.spiritualName}
          onChange={(spiritualName) => setValues((current) => (current ? { ...current, spiritualName } : current))}
          limit={PROFILE_FIELD_LIMITS.spiritualName}
          editable={!saving}
          invalid={invalidField === 'spiritualName'}
          placeholder="Необязательно"
          hint="Заполнено — именно его увидят в переписке, в справочнике людей и в общинах. Пустое поле убирает его."
        />

        <Field
          label="Статус"
          value={values.statusLine}
          onChange={(statusLine) => setValues((current) => (current ? { ...current, statusLine } : current))}
          limit={PROFILE_FIELD_LIMITS.statusLine}
          editable={!saving}
          invalid={invalidField === 'statusLine'}
          placeholder="«в Маяпуре до марта»"
          hint="Короткая строка рядом с именем."
        />

        <Field
          label="О себе"
          value={values.about}
          onChange={(about) => setValues((current) => (current ? { ...current, about } : current))}
          limit={PROFILE_FIELD_LIMITS.about}
          editable={!saving}
          invalid={invalidField === 'about'}
          multiline
          placeholder="Чем живёте, что практикуете"
          hint="Рассказ один на весь портал: его показывают и в справочнике, и в Знакомствах."
        />

        {notice ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.notice, { color: colors.text0, backgroundColor: colors.bg1, borderColor: colors.cyan }]}
          >
            {notice}
          </Text>
        ) : null}
        {saveError ? <InlineError message={saveError} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Сохранить"
          accessibilityState={{ busy: saving, disabled: saving }}
          disabled={saving}
          onPress={() => void save()}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.magenta, borderColor: colors.magenta },
            saving ? styles.busy : pressedStyle(pressed),
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onAccent }]}>Сохранить</Text>
          )}
        </Pressable>

        <Text style={[styles.footnote, { color: colors.text1, backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          Город, языки, дату рождения, соцсети и мессенджеры пока правят на сайте — в приложении их нет.
        </Text>
      </KeyboardAwareScrollView>

      <AvatarSheet
        visible={sheetVisible}
        canRemove={Boolean(profile.avatarUrl)}
        onClose={() => setSheetVisible(false)}
        onPickGallery={() => void pickFromGallery()}
        onPickCamera={() => void pickFromCamera()}
        onRemove={() => void removeAvatar()}
      />
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange(next: string): void;
  limit: number;
  editable: boolean;
  invalid: boolean;
  placeholder: string;
  hint: string;
  multiline?: boolean;
}

/**
 * Поле формы: подпись, ввод, счётчик у потолка и объяснение под ним.
 *
 * `maxLength` стоит на самом вводе — лишние символы не набираются, а не
 * отсекаются молча при сохранении. Отказ по длине от сервера всё равно
 * возможен (статус схлопывает пробелы), поэтому проверка перед отправкой
 * никуда не делась.
 */
function Field({ label, value, onChange, limit, editable, invalid, placeholder, hint, multiline = false }: FieldProps) {
  const { colors } = useTheme();
  const showCounter = shouldShowCounter(value, limit);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text1 }]}>{label}</Text>
        {showCounter ? (
          <Text style={[styles.counter, { color: colors.text1 }]}>{remainingChars(value, limit)}</Text>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        maxLength={limit}
        editable={editable}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.text1}
        accessibilityLabel={label}
        // Неверное поле обводится magenta — та же подсказка, что у плашки
        // ошибки. Рамка декоративна (порог 3:1), текст поля остаётся `text0`.
        style={[
          multiline ? styles.textarea : styles.input,
          { color: colors.text0, borderColor: invalid ? colors.magenta : colors.glassBorder, backgroundColor: colors.bg1 },
        ]}
      />
      <Text style={[styles.hint, { color: colors.text1 }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  preview: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 12 },
  previewTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewBody: { flex: 1, minWidth: 0, gap: 4 },
  previewName: { fontFamily: fonts.displayBold, fontSize: 20 },
  previewStatus: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  avatarBusy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  counter: { fontFamily: fonts.mono, fontSize: 13 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  notice: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12,
    overflow: 'hidden',
  },
  secondary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  secondaryText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  primary: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  busy: { opacity: 0.6 },
});
