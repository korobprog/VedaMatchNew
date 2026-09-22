import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ChatConversationDetail } from '@vedamatch/shared';
import { confirmTap } from '@/lib/feedback';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { hitTarget } from '@/theme/tokens';

/**
 * Вход в панель конференции — в шапке комнаты, рядом с кнопкой звонка.
 *
 * Показывается только в беседе, заведённой быстрой конференцией: у
 * обычной группы нет двери, которую можно закрыть, и значок звена цепи в
 * её шапке означал бы что-то другое. Решает это сервер — флаг
 * `isConference` в описании беседы, а не догадка экрана по названию.
 *
 * Значок — звено цепи, общепонятное «ссылка». Подпись только для
 * скринридера: в шапке помещаются три кнопки, а не три слова.
 */
export function ConferenceHeaderButton({
  conversation,
}: {
  conversation: ChatConversationDetail | null;
}) {
  const { colors } = useTheme();
  if (!conversation?.isConference) return null;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ссылка конференции"
        accessibilityHint="Срок ссылки, отправка и закрытие входа"
        onPress={() => {
          confirmTap();
          router.push({
            pathname: '/conference/[id]',
            params: { id: conversation.id },
          });
        }}
        android_ripple={ripple(colors.glassBorder, true)}
        style={({ pressed }) => [styles.button, pressedStyle(pressed)]}
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.text0}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M10 13.5a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.6-5.7l-1.7 1.7" />
          <Path d="M14 10.5a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.6 5.7l1.7-1.7" />
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    width: hitTarget,
    height: hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
