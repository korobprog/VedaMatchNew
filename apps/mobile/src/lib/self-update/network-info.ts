import * as Network from 'expo-network';
import { shouldWarnBeforeDownload, type ConnectionInfo } from './metered-network-gate';

/**
 * Обёртка над `expo-network` (VED-176) — сама не тестируется юнитом, только
 * решение `metered-network-gate.ts`, которое из неё вызывается.
 */
export async function currentConnectionInfo(): Promise<ConnectionInfo> {
  const state = await Network.getNetworkStateAsync();
  return {
    isConnected: Boolean(state.isConnected),
    isWifi: state.type === Network.NetworkStateType.WIFI,
  };
}

export async function shouldWarnBeforeDownloadNow(): Promise<boolean> {
  return shouldWarnBeforeDownload(await currentConnectionInfo());
}
