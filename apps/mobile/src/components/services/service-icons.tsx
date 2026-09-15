import { useId } from 'react';
import { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';
import type { ServiceIconKind } from '@/lib/services/service-icon-kind';

interface Props {
  kind: ServiceIconKind;
  size?: number;
}

/**
 * Иллюстрации каталога сервисов (VED-174, «Иконки») — порт
 * `apps/web/src/components/icons/service-icons.tsx` 1:1: те же фигуры,
 * градиенты и hex-цвета, тот же `switch`, только теги SVG вместо DOM
 * (`Svg`/`Path`/`Circle`/`Rect`/`Ellipse`/`Defs`/`LinearGradient`/`Stop` из
 * `react-native-svg`) и `kind` из `lib/services/service-icon-kind.ts`
 * вместо `slug`/`category` напрямую.
 *
 * Правило «только токены `theme/tokens.ts`» в `CLAUDE.md`/`spec.md`
 * написано про интерфейс — подложки, текст, границы. Это не интерфейс, а
 * иллюстрация: каждый сервис на сайте узнаётся по своему фирменному цвету
 * (мята «Вдохновения», фиолет «Музыки», индиго «Объявлений» и так далее),
 * и эти цвета не подстраиваются под тему — на сайте ровно так же. Заводить
 * под них токены означало бы либо сломать узнаваемость (единый акцент для
 * всех 13 сервисов), либо завести 13×2 токенов ради картинки, которая на
 * сайте ни одного токена не использует. Поэтому здесь те же хардкод-hex,
 * что и в исходнике на вебе — сознательное исключение, а не забытое
 * правило.
 *
 * В исходнике на вебе ни один путь не рисуется через `currentColor`
 * (проверено: `grep -n currentColor apps/web/src/components/icons/service-icons.tsx`
 * ничего не находит) — все цвета фигур заданы явно тем же образом, что и
 * здесь. Значит, у порта нет прогружаемого пропа цвета: его пришлось бы
 * добавить мёртвым (ни одна фигура на него не отреагирует), а мёртвый проп
 * хуже отсутствующего.
 *
 * Идентификаторы градиентов уникальны на экземпляр через `useId()` — как и
 * на сайте: на одном экране рисуется несколько карточек с одинаковым
 * `kind` (например несколько «активных» сервисов лайфстайл-категории), и
 * общий id столкнул бы градиенты одной карточки с фигурами другой.
 */
export function ServiceIcon({ kind, size = 28 }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = (name: string) => `${kind}-${name}-${uid}`;

  switch (kind) {
    case 'motivation':
      // Ростки лотоса со свечением — медитация и ежедневный рост.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path d="M16 28V15" stroke={`url(#${gid('stem')})`} strokeWidth={2.2} strokeLinecap="round" />
          <Path
            d="M16 22C11 22 7 17 8 11C13 11 16 16 16 22Z"
            fill={`url(#${gid('leaf-l')})`}
            stroke="#10B981"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <Path
            d="M16 18C21 18 25 13 24 7C19 7 16 12 16 18Z"
            fill={`url(#${gid('leaf-r')})`}
            stroke="#34D399"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <Circle cx={16} cy={7} r={2.5} fill="#FBBF24" />
          <Path d="M16 2V3.5M21 4L20 5.2M11 4L12 5.2" stroke="#F59E0B" strokeWidth={1.5} strokeLinecap="round" />
          <Defs>
            <LinearGradient id={gid('stem')} x1="16" y1="28" x2="16" y2="15" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#059669" />
              <Stop offset="1" stopColor="#34D399" />
            </LinearGradient>
            <LinearGradient id={gid('leaf-l')} x1="8" y1="11" x2="16" y2="22" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#10B981" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#059669" stopOpacity="0.9" />
            </LinearGradient>
            <LinearGradient id={gid('leaf-r')} x1="24" y1="7" x2="16" y2="18" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#6EE7B7" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#10B981" stopOpacity="0.8" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'music':
      // Мриданга и караталы — киртан и бхаджан.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Circle cx={8.5} cy={8} r={3.8} fill={`url(#${gid('karatala')})`} stroke="#FDE047" strokeWidth={1.2} />
          <Circle cx={8.5} cy={8} r={1.2} fill="#FEF9C3" />
          <Circle cx={14.6} cy={6.2} r={3.2} fill={`url(#${gid('karatala')})`} stroke="#FDE047" strokeWidth={1.2} />
          <Circle cx={14.6} cy={6.2} r={1} fill="#FEF9C3" />
          <Path
            d="M8.5 16.2C13.5 13.9 20.5 13.7 25 15V24.6C20.5 25.9 13.5 25.7 8.5 23.4V16.2Z"
            fill={`url(#${gid('drum')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <Path
            d="M13.5 15.2V24.6M17.5 14.7V25M21.5 14.7V25"
            stroke="#EDE9FE"
            strokeWidth={1.1}
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          <Ellipse cx={8.5} cy={19.8} rx={2} ry={3.6} fill="#EDE9FE" stroke={`url(#${gid('stroke')})`} strokeWidth={1.3} />
          <Ellipse cx={25} cy={19.8} rx={2.6} ry={4.8} fill="#DDD6FE" stroke={`url(#${gid('stroke')})`} strokeWidth={1.3} />
          <Circle cx={25} cy={19.8} r={1.4} fill="#4C1D95" fillOpacity="0.7" />
          <Defs>
            <LinearGradient id={gid('drum')} x1="8.5" y1="14" x2="25" y2="25.9" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#5B21B6" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#A855F7" stopOpacity="0.85" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="8.5" y1="14" x2="25" y2="25.9" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#C4B5FD" />
              <Stop offset="1" stopColor="#F5D0FE" />
            </LinearGradient>
            <LinearGradient id={gid('karatala')} x1="5" y1="4" x2="18" y2="12" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#B45309" />
              <Stop offset="1" stopColor="#FBBF24" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'union':
      // Сплетённые руки в форме сердца/лотоса — осознанные отношения.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M16 27C16 27 6 20 6 13C6 9.5 8.8 7 12 7C14.2 7 15.4 8.2 16 9.2C16.6 8.2 17.8 7 20 7C23.2 7 26 9.5 26 13C26 20 16 27 16 27Z"
            fill={`url(#${gid('bg')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path
            d="M11 15C13 17 15 18 16 18C17 18 19 17 21 15"
            stroke="#FFF"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeOpacity="0.85"
          />
          <Path d="M13.5 12.5C14.5 13.8 15.3 14.5 16 14.5C16.7 14.5 17.5 13.8 18.5 12.5" stroke="#FFD1E8" strokeWidth={1.5} strokeLinecap="round" />
          <Circle cx={16} cy={5} r={1.5} fill="#FFE500" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FF3E9E" stopOpacity="0.75" />
              <Stop offset="1" stopColor="#B23EFF" stopOpacity="0.85" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FF85C0" />
              <Stop offset="1" stopColor="#D896FF" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'vedabase':
      // Раскрытое писание с пальмовым листом и пером.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M5 24.5C9.5 22.5 14 23.5 16 24.5C18 23.5 22.5 22.5 27 24.5V9.5C22.5 7.5 18 8.5 16 9.5C14 8.5 9.5 7.5 5 9.5V24.5Z"
            fill={`url(#${gid('bg')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M16 9.5V24.5" stroke="#60A5FA" strokeWidth={1.5} strokeLinecap="round" />
          <Path d="M8 13.5H13M8 16.5H12M8 19.5H13" stroke="#93C5FD" strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
          <Path d="M19 13.5H24M20 16.5H24M19 19.5H24" stroke="#93C5FD" strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />
          <Path d="M16 6C16.8 4 18.5 3 20 3.5C20.5 4.8 19.5 6.5 16 9.5" stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round" />
          <Circle cx={19} cy={4.5} r={1} fill="#F59E0B" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#1E3A8A" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#3B82F6" stopOpacity="0.7" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="5" y1="7.5" x2="27" y2="24.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#60A5FA" />
              <Stop offset="1" stopColor="#93C5FD" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'astro':
      // Колесо натальной карты с полумесяцем и звёздами.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Circle cx={15} cy={18} r={9.5} fill={`url(#${gid('bg')})`} stroke={`url(#${gid('stroke')})`} strokeWidth={1.6} />
          <Path
            d="M15 8.5V27.5M5.5 18H24.5M8.4 11.4L21.6 24.6M21.6 11.4L8.4 24.6"
            stroke="#C4B5FD"
            strokeWidth={1}
            strokeOpacity="0.65"
            strokeLinecap="round"
          />
          <Circle cx={15} cy={18} r={2.4} fill="#FDE047" fillOpacity="0.9" />
          <Path
            d="M24 6.5C24 9.26 21.76 11.5 19 11.5C18.5 11.5 18.02 11.43 17.57 11.29C19.5 10.4 20.8 8.46 20.8 6.5C20.8 4.54 19.5 2.6 17.57 1.71C18.02 1.57 18.5 1.5 19 1.5C21.76 1.5 24 3.74 24 6.5Z"
            fill="#FBBF24"
          />
          <Path d="M6 6L6.7 7.8L8.5 8.5L6.7 9.2L6 11L5.3 9.2L3.5 8.5L5.3 7.8L6 6Z" fill="#F0ABFC" />
          <Circle cx={26} cy={20} r={1.1} fill="#93C5FD" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="5.5" y1="8.5" x2="24.5" y2="27.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#4C1D95" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#7C3AED" stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="5.5" y1="8.5" x2="24.5" y2="27.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#C4B5FD" />
              <Stop offset="1" stopColor="#A78BFA" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'library':
      // Закладка-ленточка с цепочкой звеньев — ссылки на внешние материалы.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M8 4H24C24.8 4 25.5 4.7 25.5 5.5V28L16 22.5L6.5 28V5.5C6.5 4.7 7.2 4 8 4Z"
            fill={`url(#${gid('bg')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Rect x={11.2} y={10.5} width={6.4} height={4.4} rx={2.2} transform="rotate(-28 11.2 10.5)" stroke="#FDE68A" strokeWidth={1.6} />
          <Rect x={14.4} y={13.3} width={6.4} height={4.4} rx={2.2} transform="rotate(-28 14.4 13.3)" stroke="#FDE68A" strokeWidth={1.6} />
          <Circle cx={21.5} cy={9} r={1.2} fill="#FEF3C7" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="6.5" y1="4" x2="25.5" y2="28" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#92400E" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#D97706" stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="6.5" y1="4" x2="25.5" y2="28" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FBBF24" />
              <Stop offset="1" stopColor="#FCD34D" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'chat':
      // Два речевых пузыря — переписка, а не рассылка.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M5 10a3 3 0 013-3h11a3 3 0 013 3v6a3 3 0 01-3 3h-6l-5 4v-4H8a3 3 0 01-3-3z"
            fill={`url(#${gid('bg')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path
            d="M13 20a3 3 0 013-3h8a3 3 0 013 3v4a3 3 0 01-3 3h-3l-4 3v-3h-1a3 3 0 01-3-3z"
            fill={`url(#${gid('bg2')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M9 11.5h9M9 14.5h6" stroke="#5EEAD4" strokeWidth={1.5} strokeLinecap="round" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="5" y1="7" x2="22" y2="23" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#134E4A" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#0D9488" stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id={gid('bg2')} x1="13" y1="17" x2="27" y2="30" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#164E63" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#0891B2" stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="5" y1="7" x2="27" y2="30" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#2DD4BF" />
              <Stop offset="1" stopColor="#67E8F9" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'contacts':
      // Визитка с сетью людей вокруг — кто рядом.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x={4} y={7} width={24} height={18} rx={3} fill={`url(#${gid('bg')})`} stroke={`url(#${gid('stroke')})`} strokeWidth={1.8} />
          <Circle cx={13} cy={14.5} r={3} fill="#E0FFFB" />
          <Path d="M8 21.5C8 18.7 10.2 17 13 17C15.8 17 18 18.7 18 21.5" stroke="#E0FFFB" strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx={23} cy={12.5} r={1.6} fill="#A8FFF3" />
          <Path d="M20 17.5C20 15.8 21.3 14.7 23 14.7C24.7 14.7 26 15.8 26 17.5" stroke="#A8FFF3" strokeWidth={1.3} strokeLinecap="round" />
          <Path d="M18.5 13.5L21 12.8" stroke="#A8FFF3" strokeWidth={1.2} strokeLinecap="round" strokeOpacity="0.8" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="4" y1="7" x2="28" y2="25" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#0F766E" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#33CCCC" stopOpacity="0.8" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="4" y1="7" x2="28" y2="25" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#5CCCCC" />
              <Stop offset="1" stopColor="#99F6E4" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'market':
      // Полосатый навес над корзиной — товары и услуги преданных.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M4 5H28L29.5 11H2.5L4 5Z"
            fill={`url(#${gid('awning')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <Path d="M11 5L9.5 11M20 5L21.5 11" stroke="#FFE9C7" strokeWidth={1.2} strokeOpacity="0.7" strokeLinecap="round" />
          <Path
            d="M6 13H26L24 27H8L6 13Z"
            fill={`url(#${gid('basket')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <Path d="M12.5 16L13.5 24M19.5 16L18.5 24M7.2 19.5H24.8" stroke="#FFE9C7" strokeWidth={1.2} strokeOpacity="0.65" strokeLinecap="round" />
          <Defs>
            <LinearGradient id={gid('awning')} x1="2.5" y1="5" x2="29.5" y2="11" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#B45309" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.85" />
            </LinearGradient>
            <LinearGradient id={gid('basket')} x1="6" y1="13" x2="26" y2="27" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#92400E" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#D97706" stopOpacity="0.8" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="2.5" y1="5" x2="29.5" y2="27" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FCD34D" />
              <Stop offset="1" stopColor="#FDE68A" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'notices':
      // Доска объявлений с двумя листками под шафрановой канцелярской кнопкой.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x={3.5} y={6.5} width={25} height={20} rx={2.5} fill={`url(#${gid('board')})`} stroke={`url(#${gid('frame')})`} strokeWidth={1.8} />
          <Rect
            x={7}
            y={10}
            width={10}
            height={11}
            rx={1}
            fill={`url(#${gid('paper-l')})`}
            transform="rotate(-6 12 15.5)"
          />
          <Path
            d="M9.2 13.6H14.8M9.2 16H14.8M9.2 18.4H12.6"
            stroke="#A16207"
            strokeWidth={1}
            strokeLinecap="round"
            strokeOpacity="0.6"
            transform="rotate(-6 12 15.5)"
          />
          <Rect
            x={16}
            y={12}
            width={9.5}
            height={10}
            rx={1}
            fill={`url(#${gid('paper-r')})`}
            transform="rotate(5 20.75 17)"
          />
          <Path
            d="M18 15.2H23.4M18 17.6H23.4M18 20H21.2"
            stroke="#A16207"
            strokeWidth={1}
            strokeLinecap="round"
            strokeOpacity="0.5"
            transform="rotate(5 20.75 17)"
          />
          <Circle cx={11.4} cy={10.6} r={2} fill="#FBBF24" stroke="#B45309" strokeWidth={0.9} />
          <Circle cx={10.8} cy={10} r={0.55} fill="#FEF9C3" />
          <Defs>
            <LinearGradient id={gid('board')} x1="3.5" y1="6.5" x2="28.5" y2="26.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#312E81" />
              <Stop offset="1" stopColor="#4F46E5" />
            </LinearGradient>
            <LinearGradient id={gid('frame')} x1="3.5" y1="6.5" x2="28.5" y2="26.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#818CF8" />
              <Stop offset="1" stopColor="#6366F1" />
            </LinearGradient>
            <LinearGradient id={gid('paper-l')} x1="7" y1="10" x2="17" y2="21" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FEF9C3" />
              <Stop offset="1" stopColor="#FDE68A" />
            </LinearGradient>
            <LinearGradient id={gid('paper-r')} x1="16" y1="12" x2="25.5" y2="22" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#FFFBEB" />
              <Stop offset="1" stopColor="#FEF3C7" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'work':
      // Канбан-доска: три колонки, карточки разной высоты, одна уже готова.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Rect x={3.5} y={5.5} width={25} height={21} rx={2.5} fill={`url(#${gid('board')})`} stroke={`url(#${gid('frame')})`} strokeWidth={1.8} />
          <Path
            d="M11.7 8.5V23.5M20.3 8.5V23.5"
            stroke="#0F766E"
            strokeWidth={1}
            strokeOpacity="0.35"
            strokeLinecap="round"
            strokeDasharray="2 2.5"
          />
          <Rect x={6} y={9} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('card')})`} />
          <Rect x={6} y={13.4} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('card')})`} />
          <Rect x={6} y={17.8} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('card')})`} />
          <Rect x={13.9} y={9} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('card')})`} />
          <Rect x={13.9} y={13.4} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('card')})`} />
          <Rect x={21.8} y={9} width={4.2} height={3.2} rx={0.9} fill={`url(#${gid('done')})`} />
          <Path d="M22.6 10.6L23.6 11.6L25.2 9.9" stroke="#065F46" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
          <Defs>
            <LinearGradient id={gid('board')} x1="3.5" y1="5.5" x2="28.5" y2="26.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#ECFEFF" />
              <Stop offset="1" stopColor="#CCFBF1" />
            </LinearGradient>
            <LinearGradient id={gid('frame')} x1="3.5" y1="5.5" x2="28.5" y2="26.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#0D9488" />
              <Stop offset="1" stopColor="#0F766E" />
            </LinearGradient>
            <LinearGradient id={gid('card')} x1="6" y1="9" x2="10.2" y2="12.2" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#5EEAD4" />
              <Stop offset="1" stopColor="#2DD4BF" />
            </LinearGradient>
            <LinearGradient id={gid('done')} x1="21.8" y1="9" x2="26" y2="12.2" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#A7F3D0" />
              <Stop offset="1" stopColor="#6EE7B7" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'wellness':
      // Лупа с листом внутри — сервис читает состав и отвечает, годна ли еда.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path d="M20.4 20.4L26.5 26.5" stroke={`url(#${gid('handle')})`} strokeWidth={3.2} strokeLinecap="round" />
          <Circle cx={14} cy={14} r={8.6} fill={`url(#${gid('lens')})`} stroke={`url(#${gid('rim')})`} strokeWidth={1.8} />
          <Path d="M10.2 17.6C9.6 12.9 12.9 9.6 18 9.4C18.2 14.4 15 17.9 10.2 17.6Z" fill={`url(#${gid('leaf')})`} />
          <Path d="M10.6 17.2C12.9 15.1 15.4 12.6 17.6 10.2" stroke="#3F6212" strokeWidth={1} strokeOpacity="0.55" strokeLinecap="round" />
          <Path d="M8.6 11.2C9.4 9.6 10.8 8.4 12.5 7.9" stroke="#FFFFFF" strokeWidth={1.4} strokeOpacity="0.7" strokeLinecap="round" />
          <Defs>
            <LinearGradient id={gid('lens')} x1="5.4" y1="5.4" x2="22.6" y2="22.6" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#F7FEE7" />
              <Stop offset="1" stopColor="#ECFCCB" />
            </LinearGradient>
            <LinearGradient id={gid('rim')} x1="5.4" y1="5.4" x2="22.6" y2="22.6" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#84CC16" />
              <Stop offset="1" stopColor="#4D7C0F" />
            </LinearGradient>
            <LinearGradient id={gid('leaf')} x1="10.2" y1="9.4" x2="18" y2="17.6" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#A3E635" />
              <Stop offset="1" stopColor="#65A30D" />
            </LinearGradient>
            <LinearGradient id={gid('handle')} x1="20.4" y1="20.4" x2="26.5" y2="26.5" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#65A30D" />
              <Stop offset="1" stopColor="#3F6212" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'travel':
      // Метка на карте с домиком внутри — где переночевать, а не куда съездить.
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Ellipse cx={16} cy={27.6} rx={5.6} ry={1.7} fill="#0EA5E9" fillOpacity="0.18" />
          <Path
            d="M16 2.8C10.6 2.8 6.2 7.1 6.2 12.5C6.2 19.6 16 27.4 16 27.4C16 27.4 25.8 19.6 25.8 12.5C25.8 7.1 21.4 2.8 16 2.8Z"
            fill={`url(#${gid('pin')})`}
            stroke={`url(#${gid('edge')})`}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <Path d="M10.6 13.1L16 8.6L21.4 13.1" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12.1 13.4V17.9H19.9V13.4" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <Rect x={14.9} y={14.9} width={2.2} height={3} rx={0.5} fill="#FFFFFF" fillOpacity="0.9" />
          <Defs>
            <LinearGradient id={gid('pin')} x1="6.2" y1="2.8" x2="25.8" y2="27.4" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#38BDF8" />
              <Stop offset="1" stopColor="#0284C7" />
            </LinearGradient>
            <LinearGradient id={gid('edge')} x1="6.2" y1="2.8" x2="25.8" y2="27.4" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#0EA5E9" />
              <Stop offset="1" stopColor="#075985" />
            </LinearGradient>
          </Defs>
        </Svg>
      );

    case 'default':
    default:
      // Лотос с тилаком — общая картинка для «Пространства преданных» и
      // любого сервиса без своей иллюстрации (1:1 с `default` на сайте).
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <Path
            d="M16 6C13 10 10 14 10 19C10 23.5 12.7 26 16 26C19.3 26 22 23.5 22 19C22 14 19 10 16 6Z"
            fill={`url(#${gid('bg')})`}
            stroke={`url(#${gid('stroke')})`}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <Path d="M10 19C6 17 4 14 5 11C8 11 11 14 12 18" stroke="#EC4899" strokeWidth={1.5} strokeLinecap="round" />
          <Path d="M22 19C26 17 28 14 27 11C24 11 21 14 20 18" stroke="#EC4899" strokeWidth={1.5} strokeLinecap="round" />
          <Path d="M16 12V18M14.5 14C14.5 16.5 16 19 16 19C16 19 17.5 16.5 17.5 14" stroke="#FDE047" strokeWidth={1.5} strokeLinecap="round" />
          <Circle cx={16} cy={21} r={1} fill="#FACC15" />
          <Defs>
            <LinearGradient id={gid('bg')} x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#831843" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#DB2777" stopOpacity="0.75" />
            </LinearGradient>
            <LinearGradient id={gid('stroke')} x1="10" y1="6" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <Stop stopColor="#F472B6" />
              <Stop offset="1" stopColor="#FBCFE8" />
            </LinearGradient>
          </Defs>
        </Svg>
      );
  }
}
