import { Bird, Cat, CircleUserRound, Dog, Fish, Mouse, Panda, Rabbit, Snail, Squirrel, Turtle, type LucideIcon } from 'lucide-react'

// Set fisso di avatar selezionabili (stesso principio della palette colori/icone
// delle categorie): l'utente sceglie da qui, non carica una foto propria.
export const AVATAR_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'cat', label: 'Gatto', Icon: Cat },
  { key: 'dog', label: 'Cane', Icon: Dog },
  { key: 'rabbit', label: 'Coniglio', Icon: Rabbit },
  { key: 'bird', label: 'Uccellino', Icon: Bird },
  { key: 'fish', label: 'Pesce', Icon: Fish },
  { key: 'turtle', label: 'Tartaruga', Icon: Turtle },
  { key: 'squirrel', label: 'Scoiattolo', Icon: Squirrel },
  { key: 'panda', label: 'Panda', Icon: Panda },
  { key: 'mouse', label: 'Topolino', Icon: Mouse },
  { key: 'snail', label: 'Lumaca', Icon: Snail },
]

const AVATAR_MAP = new Map(AVATAR_OPTIONS.map((entry) => [entry.key, entry.Icon]))

// Icona di riserva quando l'utente non ha scelto un avatar: il tipico omino utente.
export function getAvatarIcon(key?: string | null): LucideIcon {
  if (key) {
    const icon = AVATAR_MAP.get(key)
    if (icon) return icon
  }
  return CircleUserRound
}
