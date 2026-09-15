import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  visible: boolean;
  onClose(): void;
  onPickGallery(): void;
  onPickCamera(): void;
  onPickFile(): void;
}

/** Нижний лист выбора источника вложения: тот же приём, что `message-menu.tsx`. */
export function AttachmentSheet({ visible, onClose, onPickGallery, onPickCamera, onPickFile }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Закрыть меню" style={styles.backdrop} onPress={onClose} />
      <View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: colors.sheet, borderColor: colors.sheetBorder, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.glassBorder }]} />
        <Row
          label="Фото из галереи"
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
        <Row
          label="Файл"
          onPress={() => {
            onClose();
            onPickFile();
          }}
        />
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
      <Text style={[styles.rowText, { color: colors.text0 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
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
