import type { UserGalleryState, UserPhotoDto } from '@vedamatch/shared';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { InlineError } from '@/components/inline-error';
import type { UnionApi } from '@/lib/union/union-api';
import { describeUnionError } from '@/lib/union/union-error';
import { movePhoto, quotaLine, toGalleryUpload, uploadSummary, type GalleryUpload } from '@/lib/union/union-gallery';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { dark, fonts, hitTarget, radius } from '@/theme/tokens';
import { UnionButton } from './union-screen-parts';
import { UnionPhoto } from './union-photo';

/** Сколько фото выбирать из галереи за раз — как пачка загрузки на сайте. */
const PICK_LIMIT = 10;

type Busy = 'upload' | 'visibility' | 'delete' | 'reorder' | null;

/**
 * Фото анкеты (`user-gallery-editor.tsx` на сайте). Это портальная галерея:
 * те же снимки видны в профиле, а в Знакомствах — только открытые. Первое
 * фото — обложка анкеты.
 *
 * На сайте файлы сначала выбирают, потом жмут «Загрузить»; на телефоне
 * выбор из галереи или снимок камерой и есть решение — загружаем сразу.
 * Порядок меняется кнопками «раньше / позже», а не перетаскиванием: в
 * прокручиваемой анкете перетаскивание спорит с прокруткой.
 */
export function GalleryEditor({ unionApi, onChanged }: { unionApi: UnionApi; onChanged(): void }) {
  const { colors } = useTheme();
  const [gallery, setGallery] = useState<UserGalleryState | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<UserPhotoDto | null>(null);
  const busyRef = useRef<Busy>(null);

  const load = useCallback(async () => {
    try {
      setGallery(await unionApi.gallery());
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось загрузить фото.'));
    }
  }, [unionApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (kind: NonNullable<Busy>, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = kind;
    setBusy(kind);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(describeUnionError(e, 'Не удалось изменить фото.'));
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  };

  const upload = (assets: ImagePicker.ImagePickerAsset[]) => {
    const uploads: GalleryUpload[] = [];
    const denials: string[] = [];
    assets.forEach((asset, index) => {
      const result = toGalleryUpload(asset, (gallery?.photos.length ?? 0) + index);
      if (typeof result === 'string') denials.push(result);
      else uploads.push(result);
    });
    setNote(denials[0] ?? null);
    if (uploads.length === 0) return;
    void run('upload', async () => {
      const result = await unionApi.uploadPhotos(uploads);
      setNote([uploadSummary(result), denials[0]].filter(Boolean).join(' '));
      await load();
    });
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: PICK_LIMIT,
      // Меньше 1 — и iOS отдаёт JPEG вместо HEIC, который сервер не примет.
      quality: 0.85,
    });
    if (!result.canceled) upload(result.assets);
  };

  const pickFromCamera = async () => {
    // Разрешение — в момент, когда камера нужна, как у вложений переписки.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setNote('Нет доступа к камере. Разрешите доступ в настройках телефона.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) upload(result.assets.slice(0, 1));
  };

  const toggleVisibility = (photo: UserPhotoDto) =>
    void run('visibility', async () => {
      const updated = await unionApi.setPhotoPublic(photo.id, !photo.isPublic);
      setGallery((current) =>
        current ? { ...current, photos: current.photos.map((item) => (item.id === photo.id ? updated : item)) } : current,
      );
    });

  const move = (photo: UserPhotoDto, delta: number) => {
    if (!gallery) return;
    const next = movePhoto(gallery.photos, photo.id, delta);
    const previous = gallery;
    setGallery({ ...gallery, photos: next });
    void run('reorder', async () => {
      try {
        setGallery(await unionApi.reorderPhotos(next.map((item) => item.id)));
      } catch (e) {
        setGallery(previous);
        throw e;
      }
    });
  };

  const remove = () => {
    const photo = toDelete;
    if (!photo) return;
    void run('delete', async () => {
      await unionApi.deletePhoto(photo.id);
      setToDelete(null);
      setGallery((current) =>
        current
          ? {
              ...current,
              photos: current.photos.filter((item) => item.id !== photo.id),
              usedBytes: Math.max(0, current.usedBytes - photo.sizeBytes),
            }
          : current,
      );
    });
  };

  if (!gallery) {
    return error ? <InlineError message={error} /> : <ActivityIndicator color={colors.magenta} accessibilityLabel="Загружаем фото" />;
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.hint, { color: colors.text1 }]}>
        Первое фото — обложка анкеты. В Знакомствах видны только фото с отметкой «Показывается».
        {gallery.quotaBytes > 0 ? ` Занято ${quotaLine(gallery.usedBytes, gallery.quotaBytes)}.` : ''}
      </Text>

      {gallery.photos.map((photo, index) => (
        <View key={photo.id} style={[styles.row, { borderColor: colors.glassBorder, backgroundColor: colors.bg1 }]}>
          <View style={[styles.thumb, { backgroundColor: colors.bg2 }]}>
            <UnionPhoto uri={photo.thumbUrl ?? photo.url} name="Фото" initialSize={20} />
            {index === 0 ? (
              <Text style={[styles.cover, { color: dark.text0, backgroundColor: dark.scrim }]}>Обложка</Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            <Text style={[styles.state, { color: colors.text0 }]}>
              {photo.isPublic ? 'Показывается в Знакомствах' : 'Скрыто от Знакомств'}
            </Text>
            <View style={styles.buttons}>
              <SmallButton
                label={photo.isPublic ? 'Скрыть' : 'Показывать'}
                a11y={photo.isPublic ? `Скрыть фото ${index + 1} от Знакомств` : `Показывать фото ${index + 1} в Знакомствах`}
                disabled={busy !== null}
                onPress={() => toggleVisibility(photo)}
              />
              <SmallButton
                label="Раньше"
                a11y={`Фото ${index + 1}: переставить раньше`}
                disabled={busy !== null || index === 0}
                onPress={() => move(photo, -1)}
              />
              <SmallButton
                label="Позже"
                a11y={`Фото ${index + 1}: переставить позже`}
                disabled={busy !== null || index === gallery.photos.length - 1}
                onPress={() => move(photo, 1)}
              />
              <SmallButton
                label="Удалить"
                a11y={`Удалить фото ${index + 1}`}
                disabled={busy !== null}
                onPress={() => setToDelete(photo)}
              />
            </View>
          </View>
        </View>
      ))}

      <View style={styles.add}>
        <UnionButton grow label="Из галереи" busy={busy === 'upload'} disabled={busy !== null} onPress={() => void pickFromGallery()} />
        <UnionButton grow kind="secondary" label="Снять камерой" disabled={busy !== null} onPress={() => void pickFromCamera()} />
      </View>
      {note ? (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.text0, backgroundColor: colors.bg1 }]}>
          {note}
        </Text>
      ) : null}
      {error ? <InlineError message={error} /> : null}

      <ConfirmDialog
        visible={toDelete !== null}
        title="Удалить фото?"
        message="Фото удалится из профиля и из Знакомств без возможности восстановления."
        confirmLabel="Удалить"
        destructive
        busy={busy === 'delete'}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </View>
  );
}

function SmallButton({ label, a11y, disabled, onPress }: { label: string; a11y: string; disabled: boolean; onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.small, { borderColor: colors.glassBorder }, disabled ? styles.off : pressedStyle(pressed)]}
    >
      <Text style={[styles.smallText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.sm, padding: 8 },
  thumb: { width: 84, height: 104, borderRadius: 10, overflow: 'hidden' },
  cover: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  actions: { flex: 1, gap: 6 },
  state: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  small: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  smallText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  off: { opacity: 0.45 },
  add: { flexDirection: 'row', gap: 10 },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
});
