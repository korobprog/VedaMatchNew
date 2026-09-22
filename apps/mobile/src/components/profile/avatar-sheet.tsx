import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  visible: boolean;
  /** «Убрать фото» показывается только тогда, когда есть что убирать. */
  canRemove: boolean;
  onClose(): void;
  onPickGallery(): void;
  onPickCamera(): void;
  onRemove(): void;
}

/**
 * Откуда взять фотографию профиля. Тот же нижний лист, что у вложений
 * переписки (`components/chat/attachment-sheet.tsx`) — свой файл, потому что
 * набор строк другой: здесь нет «Файла», зато есть «Убрать фото».
 *
 * Подложка непрозрачная (`bg1`): сквозь полупрозрачный `sheet` просвечивает
 * форма профиля — то же решение и по той же причине, что в переписке.
 */
export function AvatarSheet({ visible, canRemove, onClose, onPickGallery, onPickCamera, onRemove }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть меню"
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
      />
      <View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: colors.bg1, borderColor: colors.glassBorder, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.glassBorder }]} />
        <Row
          label="Выбрать из галереи"
          onPress={() => {
            onClose();
            onPickGallery();
          }}
        />
        <Row
          label="Снять на камеру"
          onPress={() => {
            onClose();
            onPickCamera();
          }}
        />
        {canRemove ? (
          <Row
            label="Убрать фото"
            onPress={() => {
              onClose();
              onRemove();
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function Row({ label, onPress }: { label: string; onPress(): void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, pressedStyle(pressed)]}
    >
      {/* Текст `text0`, а не `magenta` даже у «Убрать фото»: magenta на `bg1`
          в светлой теме даёт 4.24:1 — ниже порога (то же решение у пункта
          «Удалить» в меню сообщения переписки). */}
      <Text style={[styles.rowText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 10 },
  row: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.sm, overflow: 'hidden' },
  rowText: { fontFamily: fonts.bodyMedium, fontSize: 16 },
});
