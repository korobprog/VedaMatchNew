import type { ChatMessageDto } from '@vedamatch/shared';
import { CHAT_REACTION_EMOJIS } from '@vedamatch/shared';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { messageActionFlags } from '@/lib/chat/chat-message-actions';
import { pressedStyle, ripple } from '@/theme/press';
import { useTheme } from '@/theme/theme';
import { fonts, hitTarget, radius } from '@/theme/tokens';

interface Props {
  message: ChatMessageDto | null;
  myUserId: string;
  onClose(): void;
  onReact(message: ChatMessageDto, emoji: string): void;
  onReply(message: ChatMessageDto): void;
  onCopy(message: ChatMessageDto): void;
  onEdit(message: ChatMessageDto): void;
  onDelete(message: ChatMessageDto): void;
}

/**
 * Нижний лист действий с сообщением: обычный `Modal`, не отдельная
 * библиотека (спека допускает это по умолчанию — готового bottom sheet в
 * приложении ещё нет, а второй такой зависимости эта задача не оправдывает).
 */
export function MessageMenu({ message, myUserId, onClose, onReact, onReply, onCopy, onEdit, onDelete }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const visible = message !== null;
  const flags = message ? messageActionFlags(message, myUserId) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть меню"
        style={styles.backdrop}
        onPress={onClose}
      />
      {message && flags ? (
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.sheet, borderColor: colors.sheetBorder, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.glassBorder }]} />

          <View style={styles.reactionsRow}>
            {CHAT_REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityRole="button"
                accessibilityLabel={`Реакция ${emoji}`}
                onPress={() => onReact(message, emoji)}
                android_ripple={ripple(colors.glassBorder, true)}
                style={({ pressed }) => [styles.reactionButton, pressedStyle(pressed)]}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.glassBorder }]} />

          {flags.reply ? (
            <MenuRow label="Ответить" onPress={() => onReply(message)} />
          ) : null}
          {flags.copy ? (
            <MenuRow label="Копировать текст" onPress={() => onCopy(message)} />
          ) : null}
          {flags.edit ? (
            <MenuRow label="Изменить" onPress={() => onEdit(message)} />
          ) : null}
          {flags.delete ? (
            <MenuRow label="Удалить" destructive onPress={() => onDelete(message)} />
          ) : null}
        </View>
      ) : null}
    </Modal>
  );
}

function MenuRow({ label, onPress, destructive }: { label: string; onPress(): void; destructive?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={ripple(colors.glassBorder)}
      style={({ pressed }) => [styles.row, pressedStyle(pressed)]}
    >
      <Text style={[styles.rowText, { color: destructive ? colors.magenta : colors.text0 }]}>{label}</Text>
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
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  reactionButton: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  reactionEmoji: { fontSize: 24 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  row: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.sm, overflow: 'hidden' },
  rowText: { fontFamily: fonts.bodyMedium, fontSize: 16 },
});
