import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatCalls } from '@/lib/calls/call-provider';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

/**
 * Звонок не начался (не дали микрофон/камеру, сеть, занято) — короткое
 * сообщение снизу экрана поверх любого раздела, само уходит
 * (`call-provider.tsx`, `ERROR_AUTOCLEAR_MS`). Отдельно от
 * `IncomingCallBanner`: это не входящий, а ответ на наше собственное
 * нажатие «Позвонить» или «Ответить» — до появления экрана звонка, который
 * в этом случае вообще не открывается (`call-provider.tsx`: `start()` не
 * меняет фазу с `idle` при ошибке).
 */
export function CallErrorToast() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const calls = useChatCalls();
  if (!calls || calls.state.phase !== 'idle' || !calls.state.error) return null;

  // Эвристика вместо отдельного признака в состоянии: describeMediaError
  // в call-provider.tsx всегда упоминает «настройках телефона» для отказов
  // в доступе — остальные причины (сеть, «занято» с сервера) кнопку не дают.
  const isPermissionDenial = calls.state.error.includes('настройках');

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.root,
        { bottom: insets.bottom + 16, backgroundColor: colors.bg1, borderColor: colors.glassBorder },
      ]}
    >
      <Text style={[styles.text, { color: colors.text0 }]}>{calls.state.error}</Text>
      {isPermissionDenial ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть настройки приложения"
          onPress={() => void Linking.openSettings()}
          android_ripple={ripple(colors.glassBorder)}
          style={({ pressed }) => [styles.button, { borderColor: colors.glassBorder }, pressedStyle(pressed)]}
        >
          <Text style={[styles.buttonText, { color: colors.text0 }]}>Открыть настройки</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
    elevation: 32,
    zIndex: 1000,
  },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  button: {
    alignSelf: 'flex-start',
    minHeight: hitTarget,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
