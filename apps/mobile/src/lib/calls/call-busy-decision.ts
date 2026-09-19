import type { CallConflictState } from '../../../modules/vedamatch-calls';
import { hasLiveOwnCall } from './stale-native-calls';

/**
 * «Занято» при входящем звонке (VED-222, п.7). Чистая функция: сырые факты
 * от нативного модуля (`VedamatchCalls.callConflictState()`,
 * `native-call-bridge.ts`) → решение «отклонить сразу, не показывая звонок».
 *
 * Оба случая ведут к одному решению, но по разным причинам, поэтому
 * различены в интерфейсе, а не схлопнуты в один `boolean` уже на нативной
 * стороне: свой звонок — свой же self-managed звонок VedaMatch уже идёт
 * (сервер разрешает только один активный звонок на пользователя, но пуш
 * может доехать раньше, чем клиент про это узнает); `systemBusy` — Telecom
 * считает устройство занятым ЧЕМ-ТО ЕЩЁ (сотовый разговор, другое
 * self-managed приложение).
 *
 * Прод-баг 2026-09-19: свой звонок, который звонит/набирает дольше
 * серверного таймера дозвона, занятостью не считается
 * (`hasLiveOwnCall`, `stale-native-calls.ts`) — сервер его давно закрыл, а
 * застрявшее соединение иначе блокировало все звонки до принудительной
 * остановки приложения.
 */
export function shouldDeclineAsBusy(state: CallConflictState): boolean {
  return state.systemBusy || hasLiveOwnCall(state);
}
