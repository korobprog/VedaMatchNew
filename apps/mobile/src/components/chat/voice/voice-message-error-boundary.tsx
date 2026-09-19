import { Component, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

interface InnerProps {
  children: ReactNode;
  textColor: string;
}

interface State {
  failed: boolean;
}

/**
 * Один сломанный плеер не должен ронять весь экран переписки — живая
 * проверка сборки 1021 (A51) поймала именно это: `TypeError` внутри
 * `VoiceMessagePlayer` (присваивание `player.playbackRate`, см.
 * `voice-player-rate.ts`) роняла всё дерево `chat/[id].tsx` целиком.
 * Приём тот же, что `CallChunkBoundary` в `root-shell.web.tsx` — минимальный
 * класс-компонент, только `getDerivedStateFromError`/`componentDidCatch`.
 * Класс не может звать `useTheme()` сам — цвет ошибки приходит пропом от
 * функциональной обёртки ниже.
 */
class VoiceMessageErrorBoundaryInner extends Component<InnerProps, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('Голосовое сообщение не открылось', error);
  }

  render() {
    if (this.state.failed) {
      return <Text style={[styles.text, { color: this.props.textColor }]}>Не удалось открыть голосовое</Text>;
    }
    return this.props.children;
  }
}

export function VoiceMessageErrorBoundary({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <VoiceMessageErrorBoundaryInner textColor={colors.text1}>{children}</VoiceMessageErrorBoundaryInner>;
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.body, fontSize: 13 },
});
