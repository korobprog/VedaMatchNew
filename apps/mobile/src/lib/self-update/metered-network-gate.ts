/**
 * Решение «предупреждать ли перед закачкой» (VED-176): предупреждение нужно
 * только когда есть связь, но это не Wi-Fi — на отключённой сети закачка и
 * так упадёт сетевой ошибкой, предупреждение о трафике здесь бессмысленно.
 * Обёртка над `expo-network` (`self-update-client.ts`/хук) — сама не
 * тестируется юнитом, только это решение.
 */
export interface ConnectionInfo {
  isWifi: boolean;
  isConnected: boolean;
}

export function shouldWarnBeforeDownload(connection: ConnectionInfo): boolean {
  return connection.isConnected && !connection.isWifi;
}
