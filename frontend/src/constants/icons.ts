import {
  Baby,
  Book,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Cigarette,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Music,
  PawPrint,
  Pill,
  Plane,
  PiggyBank,
  Scissors,
  Shirt,
  ShoppingCart,
  Smartphone,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

// Set fisso di icone per le categorie (stesso principio della palette colori
// fissa: non un picker libero, per mantenere l'interfaccia coerente).
export const CATEGORY_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: 'UtensilsCrossed', Icon: UtensilsCrossed },
  { name: 'ShoppingCart', Icon: ShoppingCart },
  { name: 'Coffee', Icon: Coffee },
  { name: 'Home', Icon: Home },
  { name: 'Zap', Icon: Zap },
  { name: 'Wifi', Icon: Wifi },
  { name: 'Car', Icon: Car },
  { name: 'Bus', Icon: Bus },
  { name: 'Fuel', Icon: Fuel },
  { name: 'Plane', Icon: Plane },
  { name: 'Shirt', Icon: Shirt },
  { name: 'HeartPulse', Icon: HeartPulse },
  { name: 'Pill', Icon: Pill },
  { name: 'Dumbbell', Icon: Dumbbell },
  { name: 'Gift', Icon: Gift },
  { name: 'Gamepad2', Icon: Gamepad2 },
  { name: 'Film', Icon: Film },
  { name: 'Music', Icon: Music },
  { name: 'Book', Icon: Book },
  { name: 'GraduationCap', Icon: GraduationCap },
  { name: 'PawPrint', Icon: PawPrint },
  { name: 'Scissors', Icon: Scissors },
  { name: 'Smartphone', Icon: Smartphone },
  { name: 'Cigarette', Icon: Cigarette },
  { name: 'Baby', Icon: Baby },
  { name: 'Wrench', Icon: Wrench },
  { name: 'Briefcase', Icon: Briefcase },
  { name: 'TrendingUp', Icon: TrendingUp },
  { name: 'Wallet', Icon: Wallet },
  { name: 'PiggyBank', Icon: PiggyBank },
  { name: 'CreditCard', Icon: CreditCard },
]

const ICON_MAP = new Map(CATEGORY_ICONS.map((entry) => [entry.name, entry.Icon]))

// Icona di riserva per categorie senza icona assegnata (es. create prima di
// questa funzionalità, o importate da Excel) o con un nome non riconosciuto.
export function getCategoryIcon(name?: string | null): LucideIcon {
  if (name) {
    const icon = ICON_MAP.get(name)
    if (icon) return icon
  }
  return Tag
}
