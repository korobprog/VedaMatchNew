import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cameraAction,
  describeCameraAccess,
  type CameraAccess,
} from '@/lib/wellness/camera-access';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Объяснение вместо системного диалога с порога (VED-335).
 *
 * Правило простое: сначала человек читает, зачем приложению камера, и только
 * по нажатию кнопки уходит системный запрос. Так делают не из вежливости —
 * Android спрашивает один раз, и отказ, полученный на пустом месте, закрывает
 * сканер навсегда, до похода в настройки.
 *
 * Отказ не тупик: под кнопкой всегда назван ручной ввод, и он работает.
 * Тексты и разбор состояния — `lib/wellness/camera-access.ts`.
 */
export function CameraGate({
  access,
  onRequest,
  children,
}: {
  access: CameraAccess;
  onRequest(): void;
  /** Запасной путь — форма ручного ввода. Показывается в обоих отказах. */
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const copy = describeCameraAccess(access);
  if (!copy) return null;
  const action = cameraAction(access);

  return (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text0 }]}>
        {copy.title}
      </Text>
      <Text style={[styles.body, { color: colors.text1 }]}>{copy.body}</Text>
      {copy.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (action === 'request') onRequest();
            // `Linking.openSettings()` открывает страницу разрешений самого
            // приложения — тот же путь, что у микрофона в звонках и в
            // голосовых сообщениях.
            else void Linking.openSettings();
          }}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.magenta },
            pressedStyle(pressed),
          ]}
        >
          <Text style={[styles.actionText, { color: colors.onAccent }]}>{copy.action}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.fallback, { color: colors.text1 }]}>{copy.fallback}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 16,
    gap: 12,
  },
  title: { fontFamily: fonts.displayMedium, fontSize: 18 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  action: {
    minHeight: hitTarget,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  actionText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  fallback: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
