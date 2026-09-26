import { CHAT_STATUS_TEXT_MAX } from '@vedamatch/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InlineError } from '@/components/inline-error';
import { buildUploadFormPart } from '@/lib/chat/chat-upload-part';
import type { StatusApi } from '@/lib/chat/status-api';
import {
  canPublishStatus,
  formatStatusDuration,
  normalizePickedStatusMedia,
  statusFormText,
  statusMediaDenial,
  statusTextDenial,
  type StatusMedia,
} from '@/lib/chat/statuses/status-upload-rules';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { screenErrorText } from '@/lib/api/error-text';

/** Съёмка ролика в камере ограничивается сразу пределом статуса. */
const VIDEO_MAX_SECONDS = 60;

/**
 * Новый статус (VED-129): текст, фото или видео, или текст с тем и другим —
 * как окно публикации на сайте (`status-composer.tsx`). Пикеры — те же, что
 * у вложений переписки (`expo-image-picker`), файл уходит байтами через
 * общий `buildUploadFormPart`. Пределы проверяются до отправки
 * (`status-upload-rules.ts`), окончательно — сервером: длительность ролика
 * он снимает сам.
 */
export function StatusComposer({
  statusApi,
  onClose,
  onCreated,
}: {
  statusApi: StatusApi;
  onClose(): void;
  onCreated(): void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<StatusMedia | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function take(asset: ImagePicker.ImagePickerAsset | undefined) {
    if (!asset) return;
    const next = normalizePickedStatusMedia(asset);
    setMedia(next);
    setError(statusMediaDenial(next));
  }

  async function pickGallery() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      videoMaxDuration: VIDEO_MAX_SECONDS,
    });
    if (!result.canceled) take(result.assets[0]);
  }

  async function pickCamera(kind: 'photo' | 'video') {
    setError(null);
    // Разрешение спрашивается только тут, не при открытии приложения.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Нет доступа к камере. Разрешите доступ в настройках телефона.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync(
      kind === 'video'
        ? { mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_SECONDS }
        : { mediaTypes: ['images'], quality: 0.9 },
    );
    if (!result.canceled) take(result.assets[0]);
  }

  async function publish() {
    const denial = (media ? statusMediaDenial(media) : null) ?? statusTextDenial(text, Boolean(media));
    if (denial) {
      setError(denial);
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      const body = statusFormText(text);
      if (body) form.append('text', body);
      // Байты, не `{uri,name,type}` — та форма падает под `expo`-fetch,
      // см. `lib/upload/upload-form-part.ts`.
      if (media) form.append('file', (await buildUploadFormPart(media)) as unknown as Blob);
      await statusApi.create(form);
      confirmTap();
      onCreated();
    } catch (cause) {
      setError(screenErrorText('components/chat/statuses/status-composer', cause, 'Не удалось опубликовать статус'));
    } finally {
      setPending(false);
    }
  }

  const enabled = canPublishStatus({ text, media, pending });

  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.bg1, borderColor: colors.glassBorder, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
                Новый статус
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={onClose}
                android_ripple={ripple(colors.glassBorder, true)}
                style={({ pressed }) => [styles.close, pressedStyle(pressed)]}
              >
                <Text style={[styles.closeText, { color: colors.text1 }]}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={CHAT_STATUS_TEXT_MAX}
              multiline
              autoFocus
              placeholder="Что у вас нового? Статус виден всем сутки"
              placeholderTextColor={colors.text1}
              accessibilityLabel="Текст статуса"
              style={[styles.input, { color: colors.text0, backgroundColor: colors.bg0, borderColor: colors.glassBorder }]}
            />
            <Text style={[styles.counter, { color: colors.text1 }]}>
              {text.length}/{CHAT_STATUS_TEXT_MAX}
            </Text>

            {media ? (
              <View style={[styles.preview, { backgroundColor: colors.bg0, borderColor: colors.glassBorder }]}>
                {media.kind === 'photo' ? (
                  <Image
                    source={{ uri: media.uri }}
                    style={styles.previewImage}
                    contentFit="contain"
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel="Выбранное фото"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={[styles.previewVideo, { color: colors.text0 }]}>
                    Видео{media.durationSec ? ` · ${formatStatusDuration(media.durationSec)}` : ''}
                  </Text>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Убрать файл"
                  onPress={() => {
                    setMedia(null);
                    setError(null);
                  }}
                  android_ripple={ripple(colors.glassBorder)}
                  style={({ pressed }) => [styles.remove, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
                >
                  <Text style={[styles.removeText, { color: colors.text0 }]}>Убрать</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.pickers}>
              <PickButton label="Галерея" hint="Фото или видео из галереи" onPress={() => void pickGallery()} />
              <PickButton label="Фото" hint="Снять фото на камеру" onPress={() => void pickCamera('photo')} />
              <PickButton label="Видео" hint="Снять видео до минуты" onPress={() => void pickCamera('video')} />
            </View>
            <Text style={[styles.hint, { color: colors.text1 }]}>Видео — до минуты и 50 МБ, фото — до 10 МБ.</Text>

            {error ? <InlineError message={error} /> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pending ? 'Публикуем' : 'Опубликовать'}
              accessibilityState={{ disabled: !enabled, busy: pending }}
              disabled={!enabled}
              onPress={() => void publish()}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [
                styles.publish,
                { backgroundColor: enabled ? colors.mint : colors.bg2 },
                pressedStyle(pressed),
              ]}
            >
              <Text style={[styles.publishText, { color: enabled ? colors.onMint : colors.text1 }]}>
                {pending ? 'Публикуем…' : 'Опубликовать'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PickButton({ label, hint, onPress }: { label: string; hint: string; onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.pick, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <Text style={[styles.pickText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  content: { padding: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.displayMedium, fontSize: 17 },
  close: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: hitTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  closeText: { fontFamily: fonts.bodyBold, fontSize: 18 },
  input: {
    minHeight: 96,
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', fontFamily: fonts.mono, fontSize: 12 },
  preview: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', padding: 8, gap: 8 },
  previewImage: { width: '100%', height: 200 },
  previewVideo: { fontFamily: fonts.bodySemiBold, fontSize: 15, paddingVertical: 24 },
  remove: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  removeText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  pickers: { flexDirection: 'row', gap: 8 },
  pick: {
    flex: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pickText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  publish: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
  },
  publishText: { fontFamily: fonts.bodyBold, fontSize: 15 },
});
