/**
 * Аудиомаршруты (динамик, гарнитура, датчик приближения) в браузере
 * недоступны — все методы молча ничего не делают.
 */
const noop = () => undefined;
const InCallManager = new Proxy({} as Record<string, unknown>, {
  get: () => noop,
});
export default InCallManager;
