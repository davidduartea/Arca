/**
 * Sustituto de `server-only` para los tests.
 *
 * El paquete real lanza al importarse, y esa es justamente su utilidad: rompe
 * el build si un modulo de servidor acaba en el paquete del navegador. Vitest
 * no distingue los entornos de Next, asi que sin este alias cualquier test que
 * toque `lib/api` o `lib/session` fallaria por diseño.
 *
 * La garantia sigue viva donde importa: `next build` si distingue, y ahi el
 * paquete real hace su trabajo.
 */
export {};
