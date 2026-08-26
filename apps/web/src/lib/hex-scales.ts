/**
 * Геометрия и мерцание гексагональной «чешуи» фона. Чистые функции отдельно
 * от канваса: сам холст в тесте не поднять, а раскладку сот и волну по ним
 * проверить нужно — на них держится вся картинка.
 */

export interface HexCell {
  /** Центр соты в пикселях холста. */
  x: number;
  y: number;
  col: number;
  row: number;
}

/** Точка контура соты. */
export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

/**
 * Центры сот, покрывающих прямоугольник. Соты плоской стороной вверх:
 * шаг по горизонтали — три четверти ширины, нечётные столбцы опущены на
 * половину высоты, отсюда и кладка «чешуёй».
 *
 * Сетка выходит за края на один ряд в каждую сторону: обрезанная по границе
 * сота на краю экрана читается как незакрашенный угол.
 */
export function hexCenters(
  width: number,
  height: number,
  radius: number,
): HexCell[] {
  if (radius <= 0 || width <= 0 || height <= 0) return [];

  const stepX = radius * 1.5;
  const stepY = radius * SQRT3;
  const cols = Math.ceil(width / stepX) + 2;
  const rows = Math.ceil(height / stepY) + 2;

  const cells: HexCell[] = [];
  for (let col = -1; col < cols; col += 1) {
    for (let row = -1; row < rows; row += 1) {
      cells.push({
        x: col * stepX,
        y: row * stepY + (Math.abs(col % 2) === 1 ? stepY / 2 : 0),
        col,
        row,
      });
    }
  }
  return cells;
}

/** Шесть углов соты плоской стороной вверх. */
export function hexCorners(
  cx: number,
  cy: number,
  radius: number,
): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    corners.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return corners;
}

/**
 * Яркость соты в момент `t` (секунды). Три синуса с разными периодами и
 * направлениями: по отдельности каждый читается как полоса, вместе — как
 * блик, который неспешно переползает по чешуе и никогда не повторяется
 * заметным циклом.
 *
 * Всегда в пределах 0..1 — на этом держится и цвет, и прозрачность соты.
 */
export function shimmer(x: number, y: number, t: number): number {
  const a = Math.sin(x * 0.006 + t * 0.25);
  const b = Math.sin(y * 0.008 - t * 0.18);
  const c = Math.sin((x + y) * 0.004 + t * 0.11);
  return (a + b + c) / 6 + 0.5;
}

/** Разбор `#RRGGBB` (и `#RGB`) в тройку 0..255. null — строка не цвет. */
export function parseHexColor(
  value: string,
): [number, number, number] | null {
  const text = value.trim().replace(/^#/, "");
  const full =
    text.length === 3
      ? text
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : text;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Цвет соты: сдвигаемся по акцентам портала — маджента → мята → золото — по
 * той же волне, что задаёт яркость. Тремя цветами, а не одним, чтобы чешуя
 * не выглядела крашеной в один тон.
 *
 * `stops` короче двух — вернуть нечего, и такой вызов означает, что токены
 * не прочитались; наверху это повод не рисовать вовсе.
 */
export function blendStops(
  stops: Array<[number, number, number]>,
  position: number,
): [number, number, number] {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return stops[0];

  const clamped = Math.min(1, Math.max(0, position));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const ratio = scaled - index;
  const from = stops[index];
  const to = stops[index + 1];
  return [
    Math.round(from[0] + (to[0] - from[0]) * ratio),
    Math.round(from[1] + (to[1] - from[1]) * ratio),
    Math.round(from[2] + (to[2] - from[2]) * ratio),
  ];
}

/**
 * Насколько грань соты повёрнута к источнику света: `1` — смотрит прямо на
 * него, `-1` — прямо от него. Из этого и берётся объём: у соты подсвечена
 * ближняя к курсору сторона и затемнена дальняя, как у настоящей пластины.
 *
 * Нормаль грани считаем как направление от центра соты к середине грани —
 * для выпуклого правильного шестиугольника это та же внешняя нормаль, но без
 * поворотов и нормировки исходного ребра.
 */
export function edgeLighting(
  a: Point,
  b: Point,
  cx: number,
  cy: number,
  lightX: number,
  lightY: number,
): number {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const normal = normalize(midX - cx, midY - cy);
  const toLight = normalize(lightX - midX, lightY - midY);
  if (!normal || !toLight) return 0;

  return normal[0] * toLight[0] + normal[1] * toLight[1];
}

/**
 * Спад яркости от источника света: `1` в самой точке, `0` за пределами
 * радиуса. Кривая сглажена по краям (smoothstep) — линейная давала видимый
 * круг с чёткой границей, который читался как пятно, а не как свет.
 */
export function lightFalloff(
  dx: number,
  dy: number,
  radius: number,
): number {
  if (radius <= 0) return 0;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t);
}

function normalize(x: number, y: number): [number, number] | null {
  const length = Math.hypot(x, y);
  if (length === 0) return null;
  return [x / length, y / length];
}

/**
 * Видимые боковые стенки плитки, приподнятой над фоном на вектор `(ox, oy)`.
 *
 * Объём чешуе даёт не линия по контуру, а именно эта стенка: у настоящей
 * приподнятой плитки видно торец с тех сторон, куда она смещена, — там и
 * лежит толстая тень. Возвращаются четырёхугольники «ребро сверху → то же
 * ребро внизу»; невидимые с этого ракурса стороны пропускаются.
 */
export function extrudedWalls(
  corners: Point[],
  cx: number,
  cy: number,
  ox: number,
  oy: number,
): Point[][] {
  if (ox === 0 && oy === 0) return [];

  const walls: Point[][] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    // Стенка видна, если ребро смотрит в ту же сторону, куда уходит торец.
    if ((midX - cx) * ox + (midY - cy) * oy <= 0) continue;
    walls.push([
      a,
      b,
      { x: b.x + ox, y: b.y + oy },
      { x: a.x + ox, y: a.y + oy },
    ]);
  }
  return walls;
}
