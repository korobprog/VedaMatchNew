import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/**
 * Нативная (Android/iOS) сторона обёртки — см. `.web.tsx` рядом за причиной
 * существования этого файла. Здесь просто реэкспорт: на телефоне
 * `react-native-reanimated` в приложении и так нужен целиком, откладывать
 * нечего.
 */
export const ChatKeyboardAvoidingView = KeyboardAvoidingView;
export const PersonKeyboardAwareScroll = KeyboardAwareScrollView;
