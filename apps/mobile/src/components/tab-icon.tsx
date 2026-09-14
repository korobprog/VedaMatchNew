import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type TabIconName = 'chats' | 'calls' | 'people' | 'communities' | 'services';

interface Props {
  name: TabIconName;
  color: string;
  size?: number;
}

/** Контурные иконки из макета: сетка 24, линия 2, скруглённые концы. */
export function TabIcon({ name, color, size = 24 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chats' && <Path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 18-4z" {...stroke} />}
      {name === 'calls' && (
        <Path
          d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"
          {...stroke}
        />
      )}
      {name === 'people' && (
        <>
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...stroke} />
          <Circle cx={9} cy={7} r={4} {...stroke} />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...stroke} />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...stroke} />
        </>
      )}
      {name === 'communities' && (
        <>
          <Path d="M3 21h18" {...stroke} />
          <Path d="M5 21V7l7-4 7 4v14" {...stroke} />
          <Path d="M9 21v-6h6v6" {...stroke} />
        </>
      )}
      {name === 'services' && (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={2} {...stroke} />
          <Rect x={14} y={3} width={7} height={7} rx={2} {...stroke} />
          <Rect x={3} y={14} width={7} height={7} rx={2} {...stroke} />
          <Rect x={14} y={14} width={7} height={7} rx={2} {...stroke} />
        </>
      )}
    </Svg>
  );
}
