import {
  Banknote,
  BedDouble,
  Bus,
  Circle,
  Droplets,
  Gift,
  HandCoins,
  HeartHandshake,
  House,
  Megaphone,
  Package,
  Receipt,
  ShoppingCart,
  Shirt,
  Sparkles,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { TravelCashIcon } from "@vedamatch/shared";

/**
 * Картинка к ключу значка статьи. Ключи — в `TRAVEL_CASH_ICONS` общего пакета;
 * `Record` по типу ключа не даст забыть новый значок здесь.
 */
export const CASH_ICONS: Record<
  TravelCashIcon,
  { Icon: LucideIcon; label: string }
> = {
  house: { Icon: House, label: "Дом" },
  bed: { Icon: BedDouble, label: "Кровать" },
  banknote: { Icon: Banknote, label: "Деньги" },
  gift: { Icon: Gift, label: "Подарок" },
  seva: { Icon: HeartHandshake, label: "Служение" },
  cart: { Icon: ShoppingCart, label: "Покупки" },
  food: { Icon: Utensils, label: "Еда" },
  cleaning: { Icon: Sparkles, label: "Уборка" },
  laundry: { Icon: Shirt, label: "Стирка" },
  repair: { Icon: Wrench, label: "Ремонт" },
  utilities: { Icon: Zap, label: "Свет и газ" },
  water: { Icon: Droplets, label: "Вода" },
  internet: { Icon: Wifi, label: "Интернет" },
  ads: { Icon: Megaphone, label: "Реклама" },
  salary: { Icon: HandCoins, label: "Зарплата" },
  transport: { Icon: Bus, label: "Транспорт" },
  fees: { Icon: Receipt, label: "Сборы и налоги" },
  package: { Icon: Package, label: "Посылки" },
  other: { Icon: Circle, label: "Прочее" },
};

export function CashIcon({
  icon,
  className,
}: {
  icon: TravelCashIcon | null | undefined;
  className?: string;
}) {
  const { Icon } = CASH_ICONS[icon ?? "other"] ?? CASH_ICONS.other;
  return <Icon aria-hidden="true" className={className} />;
}
