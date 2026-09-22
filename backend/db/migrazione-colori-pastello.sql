-- ---------------------------------------------------------------------------
-- MySimpleEconomy — conversione dei colori delle categorie in pastello
--
-- CATEGORY_COLORS è solo la tavolozza offerta dal selettore: il colore vero è
-- salvato su categories.color, quindi cambiare la costante non tocca le
-- categorie che esistono già. Questo script le converte.
--
-- Le due tavolozze hanno diciannove valori nelle stesse tinte e nello stesso
-- ordine, quindi la corrispondenza è posizionale ed esatta.
--
-- Idempotente: i valori nuovi non compaiono fra i vecchi, quindi rieseguirlo
-- non cambia più nulla. Tocca solo i colori della vecchia tavolozza: un colore
-- scelto altrove (import, categorie storiche) resta com'è.
--
-- Senza questo script l'app funziona lo stesso — il glifo dell'icona si adatta
-- da solo alla luminosità del fondo — ma convivono due generazioni di colori.
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE categories SET color = CASE upper(color)
    WHEN '#EF4444' THEN '#F5A3A3'
    WHEN '#F97316' THEN '#F8C39A'
    WHEN '#F59E0B' THEN '#F8D6A0'
    WHEN '#EAB308' THEN '#F1E29C'
    WHEN '#84CC16' THEN '#CFE49E'
    WHEN '#22C55E' THEN '#A9DFB4'
    WHEN '#10B981' THEN '#9FDCC4'
    WHEN '#14B8A6' THEN '#9FD8D3'
    WHEN '#06B6D4' THEN '#A0D8E6'
    WHEN '#0EA5E9' THEN '#A6CFEA'
    WHEN '#3B82F6' THEN '#AFC6F0'
    WHEN '#6366F1' THEN '#B6BAEE'
    WHEN '#8B5CF6' THEN '#C3B4F0'
    WHEN '#A855F7' THEN '#CFB2ED'
    WHEN '#D946EF' THEN '#E2B0EA'
    WHEN '#EC4899' THEN '#F0AFCB'
    WHEN '#F43F5E' THEN '#F4AEB9'
    WHEN '#64748B' THEN '#C0CAD6'
    WHEN '#78716C' THEN '#CCC6BF'
    ELSE color
END
WHERE upper(color) IN (
    '#EF4444',
    '#F97316',
    '#F59E0B',
    '#EAB308',
    '#84CC16',
    '#22C55E',
    '#10B981',
    '#14B8A6',
    '#06B6D4',
    '#0EA5E9',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#A855F7',
    '#D946EF',
    '#EC4899',
    '#F43F5E',
    '#64748B',
    '#78716C'
);

COMMIT;
