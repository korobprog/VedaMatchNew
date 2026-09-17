import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmButtonPalette } from './confirm-dialog-style';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Кнопка подтверждения — акцент опасного действия (`magenta`), как «Удалить аккаунт». */
  destructive?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Модальное подтверждение опасного действия — работает одинаково на всех
 * платформах. `Alert.alert` из `react-native` на вебе — заглушка без эффекта
 * (`react-native-web`: `class Alert { static alert() {} }`), поэтому ею
 * нельзя пользоваться ни на `ios.vedamatch.com`, ни внутри Telegram Mini App
 * — а это ровно то, ради чего строится подтверждение удаления аккаунта.
 * `window.confirm` тоже не подходит: часть клиентов Telegram WebView его
 * блокирует или тихо игнорирует. Строится на `Modal` (у `react-native-web`
 * это полноценный компонент с фокус-ловушкой и порталом, не заглушка) —
 * тем же приёмом, что нижние листы `attachment-sheet.tsx`/`message-menu.tsx`:
 * подложка `colors.scrim` закрывает по тапу, `onRequestClose` — по
 * аппаратной кнопке «назад» на Android.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  const confirmPalette = confirmButtonPalette(destructive, colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.wrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onCancel}
        />
        <View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: colors.bg1, borderColor: colors.glassBorder }]}
        >
          <Text style={[styles.title, { color: colors.text0 }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.text1 }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onCancel}
              android_ripple={ripple(colors.glassBorder)}
              style={({ pressed }) => [styles.button, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
            >
              <Text style={[styles.buttonText, { color: colors.text0 }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={onConfirm}
              android_ripple={ripple(confirmPalette.border)}
              style={({ pressed }) => [styles.button, { borderColor: confirmPalette.border }, pressedStyle(pressed)]}
            >
              <Text style={[styles.buttonText, { color: confirmPalette.text }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderWidth: 1, borderRadius: radius.md, padding: 20, gap: 12 },
  title: { fontFamily: fonts.bodyBold, fontSize: 17 },
  message: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: {
    flex: 1,
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
