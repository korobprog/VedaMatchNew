import { router } from 'expo-router';
import { useEffect } from 'react';
import { useSession } from '@/lib/auth/session';
import { pendingConference } from '@/lib/chat/conference-pending';

/**
 * Возврат в конференцию после входа.
 *
 * На сайте это делает `?returnTo=`: браузер уходит на страницу входа и
 * возвращается по тому же адресу. В приложении адреса нет — вход открывает
 * системный браузер и отдаёт управление по `vedamatch://auth`, где о
 * конференции ничего не известно. Поэтому экран ссылки запоминает намерение
 * (`conference-pending.ts`), а этот компонент забирает его, как только
 * сессия стала «вошёл».
 *
 * Работает одинаково и для входа, и для регистрации: в портале первый вход
 * и есть регистрация, отдельного шага «заведите аккаунт» нет.
 *
 * Ничего не рисует и живёт в корневом стеке — рядом с `PushBridge`, который
 * решает ту же задачу для пушей.
 */
export function ConferenceReturn() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'signed') return;
    const token = pendingConference.take();
    if (!token) return;
    // `replace`, а не `push`: экран входа позади уже не нужен, а «назад» из
    // конференции должно вести к вкладкам.
    router.replace({ pathname: '/j/[token]', params: { token } });
  }, [status]);

  return null;
}
