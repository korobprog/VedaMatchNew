import * as Network from 'expo-network';
import { connectivityFromState, settleWithin, type Connectivity } from './startup-decision';

/**
 * Обёртки над `expo-network` для старта без сети. Сами не тестируются юнитом
 * — решение по их ответу принимает `startup-decision.ts`. На вебе тот же
 * пакет отвечает по `navigator.onLine` и событиям `online`/`offline`.
 */

/** Текущее состояние сети; никогда не бросает и не висит дольше `timeoutMs`. */
export async function probeConnectivity(timeoutMs: number): Promise<Connectivity> {
  const result = await settleWithin(Network.getNetworkStateAsync(), timeoutMs);
  return result?.ok ? connectivityFromState(result.value) : 'unknown';
}

/** Состояние сети с подпиской на изменения; до первого ответа — `'unknown'`. */
export function useConnectivity(): Connectivity {
  return connectivityFromState(Network.useNetworkState());
}
