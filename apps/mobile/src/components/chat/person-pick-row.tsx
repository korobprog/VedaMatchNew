import type { ChatUserSummary } from '@vedamatch/shared';
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';
import { ChatAvatar } from './chat-avatar';

interface Props {
  person: ChatUserSummary;
  selected: boolean;
  /** Id вместо замыкания: колбэк один на весь список, и memo строки держится. */
  onToggle(userId: string): void;
  /** Строка занята сетевым действием — приглашение уже отправлено. */
  busy?: boolean;
  disabled?: boolean;
}

/**
 * Строка выбора человека: аватар, имя и отметка. Одним компонентом
 * пользуются форма новой беседы (отмечаем участников) и экран участников
 * (зовём по одному) — во втором случае отметка сменяется крутилкой на время
 * запроса.
 */
function PersonPickRowImpl({ person, selected, onToggle, busy = false, disabled = false }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={person.name}
      accessibilityState={{ checked: selected, disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => onToggle(person.id)}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.glassBorder }, pressedStyle(pressed)]}
    >
      <ChatAvatar id={person.id} name={person.name} uri={person.avatarUrl} size={40} />
      <Text numberOfLines={1} style={[styles.name, { color: colors.text0 }]}>
        {person.name}
      </Text>
      {busy ? (
        <ActivityIndicator color={colors.text1} />
      ) : (
        <View
          // Состояние озвучивает сама строка (`checked`), значок — картинка.
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={[
            styles.box,
            selected
              ? { borderColor: colors.magenta, backgroundColor: colors.magenta }
              : { borderColor: colors.glassBorder, backgroundColor: colors.glass },
          ]}
        >
          {selected ? <Text style={[styles.tick, { color: colors.onAccent }]}>✓</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

export const PersonPickRow = memo(PersonPickRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: hitTarget + 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 15 },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 18 },
});
