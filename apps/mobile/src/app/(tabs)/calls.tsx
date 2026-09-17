import { router } from 'expo-router';
import { SitePlaceholder } from '@/components/site-placeholder';

/**
 * История звонков появляется на этапе 1 (VED-219). Долгое нажатие на
 * заголовок — скрытый вход в служебный экран «Проверка связи» (этап 0,
 * VED-218): инструмент команды для замера relay на Wi-Fi/LTE, не
 * продуктовая функция, поэтому без видимой подсказки.
 */
export default function CallsScreen() {
  return (
    <SitePlaceholder
      title="Звонки"
      subtitle="Звонки и их история появятся в приложении в следующих версиях. Пока позвонить можно на сайте."
      path="/chat/calls"
      onTitleLongPress={() => router.push('/calls-probe')}
    />
  );
}
