/*
 * Amounts travel as whole micro-dollars and unit prices as decimal strings (see
 * api/admin.yaml). Forms take dollars, so these convert at the edge of a form.
 */

const MICROS_PER_DOLLAR = 1_000_000;

export const toMicros = (dollars: number) => Math.round(dollars * MICROS_PER_DOLLAR);

export const toDollars = (micros: number) => micros / MICROS_PER_DOLLAR;
