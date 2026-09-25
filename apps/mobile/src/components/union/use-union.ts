import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth/session';
import { createUnionApi, type UnionApi } from '@/lib/union/union-api';

/** Клиент Знакомств поверх API-клиента сессии — один на экран. */
export function useUnionApi(): UnionApi {
  const { api } = useSession();
  return useMemo(() => createUnionApi(api), [api]);
}

/**
 * Сколько входящих заявок ждут ответа — счётчик на вкладке «Лайки».
 * Перечитывается при каждом возвращении на экран: ответили на заявку в
 * «Лайках» — вернувшись в «Анкеты», человек не должен видеть старое число.
 * Ошибка счётчика экран не роняет: без числа вкладка всё равно работает.
 */
export function useIncomingPending(unionApi: UnionApi): number {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      unionApi
        .connectionCounts()
        .then((value) => {
          if (alive) setCount(value.incomingPending);
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, [unionApi]),
  );
  return count;
}
