/**
 * Чистые правила веб-пушей (VED-313): распознавание среды и решение, что
 * показать человеку в разделе «Уведомления на этом устройстве».
 *
 * Модуль без единого обращения к браузеру — это нужно и тесту, и разделению
 * платформ: значения в него передаёт `web-push.ts`, который живёт только в
 * веб-сборке. В нативную сборку (Android, iOS из App Store) ни он, ни этот
 * файл не попадают: там пуши идут через Firebase, см. `push-bridge.tsx`.
 */

/** Разрешение браузера на уведомления, как его отдаёт `Notification.permission`. */
export type WebPushSupport = 'unsupported' | 'denied' | 'default' | 'granted';

export interface WebPushEnvironment {
  support: WebPushSupport;
  /** Открыто как приложение (с домашнего экрана), а не вкладкой браузера. */
  standalone: boolean;
  /** iPhone или iPad — там правило про домашний экран обязательное. */
  ios: boolean;
}

/**
 * Пять исходов раздела. Тексты держим здесь, а не в разметке: правило и
 * формулировка — одно решение, и проверять их удобнее вместе.
 */
export type WebPushSectionKind =
  /** iPhone во вкладке Safari: пуши не придут, пока сайт не на домашнем экране. */
  | 'install-first'
  /** Можно включить прямо сейчас. */
  | 'enable'
  /** Уже включены. */
  | 'enabled'
  /** Человек запретил — вернуть можно только в настройках телефона. */
  | 'blocked'
  /** Браузер не умеет уведомления вовсе. */
  | 'unsupported';

export interface WebPushSectionState {
  kind: WebPushSectionKind;
  /** Одна строка объяснения. */
  hint: string;
  /** Шаги «как сделать» — пустой список, когда делать нечего. */
  steps: string[];
  showEnableButton: boolean;
}

const INSTALL_STEPS = [
  'Нажмите «Поделиться» — значок с квадратом и стрелкой вверх внизу экрана Safari.',
  'Пролистайте список и выберите «На экран „Домой“».',
  'Закройте Safari и откройте VedaMatch со значка на домашнем экране.',
  'Вернитесь в этот раздел и нажмите «Включить уведомления».',
];

export function describeWebPushSection(
  environment: WebPushEnvironment,
): WebPushSectionState {
  // Порядок важен. На айфоне во вкладке браузера уведомлений нет вообще —
  // `Notification` там не существует, и без этой ветки человек прочёл бы
  // «браузер не умеет» и решил бы, что дело безнадёжно. Дело как раз
  // поправимое, и сказать надо именно это.
  if (environment.ios && !environment.standalone) {
    return {
      kind: 'install-first',
      hint: 'Пока VedaMatch открыт вкладкой в браузере, iPhone уведомления не доставляет — так устроена сама система. Добавьте VedaMatch на домашний экран, и они заработают.',
      steps: INSTALL_STEPS,
      showEnableButton: false,
    };
  }
  if (environment.support === 'unsupported') {
    return {
      kind: 'unsupported',
      hint: 'Этот браузер не умеет показывать уведомления. Список внутри приложения работает и без них.',
      steps: [],
      showEnableButton: false,
    };
  }
  if (environment.support === 'denied') {
    return {
      kind: 'blocked',
      hint: environment.ios
        ? 'Уведомления запрещены. Включить их снова можно только в настройках телефона: «Настройки» → «Уведомления» → VedaMatch.'
        : 'Уведомления запрещены. Включить их снова можно только в настройках браузера для этого сайта.',
      steps: [],
      showEnableButton: false,
    };
  }
  if (environment.support === 'granted') {
    return {
      kind: 'enabled',
      hint: 'Сообщения и звонки приходят на это устройство, даже когда VedaMatch закрыт.',
      steps: [],
      showEnableButton: false,
    };
  }
  return {
    kind: 'enable',
    hint: 'Сообщения и звонки будут приходить на это устройство, даже когда VedaMatch закрыт.',
    steps: [],
    showEnableButton: true,
  };
}

/**
 * Айфон или айпад. iPadOS с некоторых версий представляется Safari на Mac, и
 * отличает его только сенсорный экран — отсюда вторая половина условия.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return userAgent.includes('Macintosh') && maxTouchPoints > 1;
}

/**
 * Открыто как приложение с домашнего экрана. Safari до сих пор отвечает на это
 * своим `navigator.standalone`, остальные — медиазапросом `display-mode`;
 * спрашиваем оба, потому что промахнуться здесь дороже всего: именно от
 * этого ответа зависит, обещаем мы человеку уведомления или объясняем, как их
 * получить.
 */
export function isStandaloneDisplay(params: {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}): boolean {
  return params.displayModeStandalone || params.navigatorStandalone;
}
