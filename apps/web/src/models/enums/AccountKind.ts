/**
 * De quién es una cuenta.
 *
 * Un ingreso desde fuera tiene que salir de algún sitio, o la transacción no
 * cuadraría a cero. Sale de una cuenta de sistema — el equivalente contable de
 * «el mundo exterior» — que sí puede quedar en negativo.
 *
 * Es un objeto `as const` y no un `enum` de TypeScript. Se lee igual en el
 * sitio donde se usa (`AccountKind.SYSTEM`), pero el valor sigue siendo la
 * cadena que manda la API: un `enum` obligaría a convertir en la frontera y a
 * confiar en que los dos lados no se separen nunca.
 */
export const AccountKind = {
  USER: "USER",
  SYSTEM: "SYSTEM",
} as const;

export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

export const ACCOUNT_KINDS = Object.values(AccountKind);
