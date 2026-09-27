/**
 * Градусы в привычный астрологу вид: 23°40′.
 *
 * Минуты отбрасываются, а не округляются: 29.999° — это ещё 29°59′ того же
 * знака, округление дало бы «30°00′», которого внутри знака не бывает.
 * Отбрасывание идёт от общего числа минут с допуском на двоичную дробь, иначе
 * 15°23′ = 15.38333… после `* 60` превращается в 922.9999… и читается 15°22′.
 */
export function formatDegrees(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0°00′";
  const totalMinutes = Math.floor(value * 60 + 1e-7);
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${degrees}°${String(minutes).padStart(2, "0")}′`;
}
