import * as Network from 'expo-network';
import { useEffect, useRef } from 'react';
import {
  connectivityFromState,
  settleWithin,
  shouldReloadOnReconnect,
  type Connectivity,
} from './startup-decision';

/**
 * Обёртки над `expo-network` для работы без сети. Сами не тестируются юнитом
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

/** Предыдущее значение — чтобы поймать именно момент возвращения сети. */
export function usePreviousConnectivity(value: Connectivity): Connectivity {
  const ref = useRef<Connectivity>(value);
  const previous = ref.current;
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return previous;
}

/**
 * Экран с ошибкой загрузки перечитывает себя, когда сеть вернулась
 * (`shouldReloadOnReconnect`), — тем же сигналом, что снимает плашку.
 * `reload` — то же, что делает кнопка «Повторить»; берётся последняя версия
 * из ref, чтобы решение зависело только от смены сети.
 */
export function useReloadWhenOnline(failed: boolean, reload: () => void): void {
  const current = useConnectivity();
  const previous = usePreviousConnectivity(current);
  const reloadRef = useRef(reload);
  const failedRef = useRef(failed);
  reloadRef.current = reload;
  failedRef.current = failed;
  useEffect(() => {
    if (shouldReloadOnReconnect({ failed: failedRef.current, previous, current })) reloadRef.current();
    // Решение только на смену сети: появление ошибки само по себе ничего не
    // перечитывает, иначе экран без сети повторял бы запрос в цикле.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
}
