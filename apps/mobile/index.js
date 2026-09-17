// Точка входа приложения (замена `expo-router/entry` в `package.json`).
// Порядок важен: фоновый обработчик FCM и headless-задача «отклонить из
// фона» должны зарегистрироваться раньше, чем `expo-router/entry` поднимет
// обычный рендер — VED-221, docs/mobile-calls-native.md, §4.
import { AppRegistry } from 'react-native';
import { declineCallHeadlessTask } from './src/lib/calls/decline-call-headless-task';
import { hangupCallHeadlessTask } from './src/lib/calls/hangup-call-headless-task';
import './src/lib/push/background-handler';

AppRegistry.registerHeadlessTask('VedamatchCallDecline', () => declineCallHeadlessTask);
// VED-222, п.1 (feedback-001.md, блокирующий п.2): «Завершить» из
// CallForegroundService.onTaskRemoved() — тот же headless-механизм, что и
// «Отклонить» выше, не событие через NativeEventEmitter.
AppRegistry.registerHeadlessTask('VedamatchCallHangup', () => hangupCallHeadlessTask);

require('expo-router/entry');
