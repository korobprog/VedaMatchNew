// tz-lookup не поставляет типов. Функция синхронная и всегда возвращает
// идентификатор зоны IANA для любой точки суши и моря.
declare module 'tz-lookup' {
  export default function tzLookup(latitude: number, longitude: number): string;
}
