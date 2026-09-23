import { BLOG_POST_MAX_IMAGES, BLOG_POST_TITLE_MAX_LENGTH } from '@vedamatch/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { blogHeaderOptions } from '@/components/blog/blog-list-parts';
import { InlineError } from '@/components/inline-error';
import { PersonKeyboardAwareScroll as KeyboardAwareScrollView } from '@/components/keyboard-controller-web';
import { useSession } from '@/lib/auth/session';
import { createBlogApi } from '@/lib/blog/blog-api';
import { announceBlogChange } from '@/lib/blog/blog-changes';
import {
  EMPTY_BLOG_DRAFT,
  addBlogPhotos,
  blogTextCounter,
  remainingPhotoSlots,
  removeBlogPhoto,
  takeBlogAssets,
  validateBlogDraft,
  type BlogDraft,
  type PickedBlogAsset,
} from '@/lib/blog/blog-draft';
import { blogCodeMessage, describeBlogError, describeFailedPhotos } from '@/lib/blog/blog-error';
import { openBlogPost } from '@/lib/blog/blog-routes';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Новый пост блог-ленты (VED-334): заголовок, текст и до 10 фотографий из
 * галереи или с камеры.
 *
 * Фотографии уходят тем же запросом, что и текст, через общий путь
 * отправки файлов приложения (`lib/upload/upload-form-part.ts` — байты, не
 * `{uri,name,type}`: ту форму `expo`-fetch отвергает). Пока запрос идёт,
 * кнопка заблокирована; не вышло — черновик остаётся целиком, рядом ошибка
 * словами. Проверка до отправки — та же, что на сервере
 * (`lib/blog/blog-draft.ts`).
 */
export default function NewBlogPostScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const blogApi = useMemo(() => createBlogApi(api), [api]);
  const [draft, setDraft] = useState<BlogDraft>(EMPTY_BLOG_DRAFT);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  const counter = blogTextCounter(draft.text);
  const slots = remainingPhotoSlots(draft);

  const addPhotos = useCallback(
    (assets: readonly PickedBlogAsset[]) => {
      const { photos, denial } = takeBlogAssets(assets, draft.photos.length);
      const { draft: next, dropped } = addBlogPhotos(draft, photos);
      setDraft(next);
      const notes = [denial, dropped > 0 ? `Больше ${BLOG_POST_MAX_IMAGES} фотографий в пост не поместится.` : null];
      const note = notes.filter((item) => item !== null).join(' ');
      setPhotoNote(note === '' ? null : note);
    },
    [draft],
  );

  const pickFromGallery = useCallback(async () => {
    setPhotoNote(null);
    if (slots <= 0) {
      setPhotoNote(`Больше ${BLOG_POST_MAX_IMAGES} фотографий в пост не поместится.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: slots,
      // Меньше 1 — и iOS отдаёт JPEG вместо HEIC, который сервер не примет.
      quality: 0.85,
    });
    if (result.canceled) return;
    addPhotos(result.assets);
  }, [addPhotos, slots]);

  const pickFromCamera = useCallback(async () => {
    setPhotoNote(null);
    if (slots <= 0) {
      setPhotoNote(`Больше ${BLOG_POST_MAX_IMAGES} фотографий в пост не поместится.`);
      return;
    }
    // Разрешение — в момент, когда камера нужна, как у вложений переписки.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoNote('Нет доступа к камере. Разрешите доступ в настройках телефона.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled) return;
    addPhotos(result.assets.slice(0, 1));
  }, [addPhotos, slots]);

  const publish = useCallback(async () => {
    if (sending) return;
    const invalid = validateBlogDraft(draft);
    if (invalid) {
      setError(blogCodeMessage(invalid));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await blogApi.create(draft);
      announceBlogChange({ kind: 'created', post: created.post });
      confirmTap();
      setDraft(EMPTY_BLOG_DRAFT);
      const failed = describeFailedPhotos(created.failed);
      if (failed) {
        // Пост вышел без части фотографий — открываем его самого с
        // объяснением, а не молча уходим в ленту: иначе человек ищет там
        // снимок, которого нет.
        router.replace({ pathname: '/blog/post/[id]', params: { id: created.post.id, notice: failed } });
        return;
      }
      if (router.canGoBack()) router.back();
      else openBlogPost(created.post.id);
    } catch (cause) {
      setError(describeBlogError(cause, 'Не удалось опубликовать пост.'));
    } finally {
      setSending(false);
    }
  }, [blogApi, draft, sending]);

  const titleTooLong = draft.title.trim().length > BLOG_POST_TITLE_MAX_LENGTH;
  const counterColor = counter.tone === 'quiet' ? colors.text1 : colors.text0;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg0 }]}>
      <Stack.Screen options={blogHeaderOptions(colors, 'Новый пост')} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
        <Text style={[styles.lead, { color: colors.text1 }]}>
          Пост увидят все участники портала — в ленте на сайте и в приложении.
        </Text>

        <View style={styles.field}>
          <Text nativeID="blog-title-label" style={[styles.label, { color: colors.text1 }]}>
            Заголовок — необязательно
          </Text>
          <TextInput
            accessibilityLabelledBy="blog-title-label"
            accessibilityLabel="Заголовок"
            value={draft.title}
            onChangeText={(title) => setDraft((current) => ({ ...current, title }))}
            placeholder="О чём пост"
            placeholderTextColor={colors.text1}
            returnKeyType="next"
            style={[
              styles.input,
              { color: colors.text0, backgroundColor: colors.bg1, borderColor: titleTooLong ? colors.magenta : colors.glassBorder },
            ]}
          />
          {titleTooLong ? (
            <Text style={[styles.hint, { color: colors.text1 }]}>
              Заголовок длиннее {BLOG_POST_TITLE_MAX_LENGTH} знаков — сократите его.
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text nativeID="blog-text-label" style={[styles.label, { color: colors.text1 }]}>
            Текст
          </Text>
          <TextInput
            accessibilityLabelledBy="blog-text-label"
            accessibilityLabel="Текст поста"
            value={draft.text}
            onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
            placeholder="Что происходит?"
            placeholderTextColor={colors.text1}
            multiline
            textAlignVertical="top"
            style={[
              styles.input,
              styles.textArea,
              { color: colors.text0, backgroundColor: colors.bg1, borderColor: counter.tone === 'over' ? colors.magenta : colors.glassBorder },
            ]}
          />
          <Text
            accessibilityLiveRegion={counter.tone === 'quiet' ? 'none' : 'polite'}
            style={[styles.hint, counter.tone !== 'quiet' && styles.hintStrong, { color: counterColor }]}
          >
            {counter.label}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.text1 }]}>
            Фотографии · {draft.photos.length} из {BLOG_POST_MAX_IMAGES}
          </Text>
          {draft.photos.length > 0 ? (
            <View style={styles.photos}>
              {draft.photos.map((photo, index) => (
                <View key={photo.key} style={[styles.photo, { borderColor: colors.glassBorder, backgroundColor: colors.bg2 }]}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                    contentFit="cover"
                    accessible
                    accessibilityLabel={`Фотография ${index + 1}`}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Убрать фотографию ${index + 1}`}
                    onPress={() => setDraft((current) => removeBlogPhoto(current, photo.key))}
                    disabled={sending}
                    android_ripple={ripple(colors.glassBorder)}
                    style={({ pressed }) => [styles.photoRemove, { backgroundColor: colors.bg1 }, pressedStyle(pressed)]}
                  >
                    <Text style={[styles.photoRemoveText, { color: colors.text0 }]}>Убрать</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.pickRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: sending || slots <= 0 }}
              onPress={() => void pickFromGallery()}
              disabled={sending}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.pick, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }, pressedStyle(pressed)]}
            >
              <Text style={[styles.pickText, { color: colors.text0 }]}>Из галереи</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: sending || slots <= 0 }}
              onPress={() => void pickFromCamera()}
              disabled={sending}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.pick, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }, pressedStyle(pressed)]}
            >
              <Text style={[styles.pickText, { color: colors.text0 }]}>Снять</Text>
            </Pressable>
          </View>
          {photoNote ? <InlineError message={photoNote} /> : null}
        </View>

        {error ? <InlineError message={error} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: sending, disabled: sending }}
          accessibilityLabel={sending ? 'Публикуем пост' : 'Опубликовать'}
          onPress={() => void publish()}
          disabled={sending}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.submit, { backgroundColor: colors.magenta }, pressedStyle(pressed)]}
        >
          {sending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={[styles.submitText, { color: colors.onAccent }]}>Опубликовать</Text>
          )}
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 18 },
  lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  input: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  textArea: { minHeight: 160, lineHeight: 22 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  hintStrong: { fontFamily: fonts.bodySemiBold },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 104, borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  photoImage: { width: '100%', aspectRatio: 1 },
  photoRemove: { minHeight: hitTarget, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  pickRow: { flexDirection: 'row', gap: 8 },
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
  submit: { minHeight: hitTarget, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  submitText: { fontFamily: fonts.bodyBold, fontSize: 16 },
});
