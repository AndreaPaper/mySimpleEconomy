// Gli importi: centesimi interi dentro il backend locale, euro solo ai bordi.
//
// Il backend Java usa BigDecimal; in JavaScript i numeri sono in virgola mobile, e
// 0,10 + 0,20 non fa 0,30. Con i centesimi interi le somme sono esatte. Si converte
// quando un importo entra (dal JSON della richiesta) e quando esce (nel JSON della
// risposta), e da nessun'altra parte.

export type Cents = number

/** Da euro (come arrivano nel JSON) a centesimi, arrotondando al centesimo. */
export function toCents(euros: number): Cents {
  return Math.round(euros * 100)
}

/** Da centesimi a euro, per il JSON della risposta. */
export function toEuros(cents: Cents): number {
  return cents / 100
}

export function toEurosOrNull(cents: Cents | null | undefined): number | null {
  return cents === null || cents === undefined ? null : toEuros(cents)
}

/**
 * Una divisione arrotondata al centesimo "half up", come
 * BigDecimal.divide(n, 2, RoundingMode.HALF_UP) nel backend.
 */
export function divideHalfUp(cents: Cents, divisor: number): Cents {
  const q = cents / divisor
  return Math.sign(q) * Math.round(Math.abs(q) + 1e-9)
}
