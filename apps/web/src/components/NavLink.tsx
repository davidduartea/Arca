"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * El aspecto de todo lo que va en la navegación.
 *
 * Se exporta porque en la barra no sólo hay enlaces: «Salir» es un `<button>`
 * dentro de un formulario, y tiene que verse exactamente igual que sus vecinos.
 *
 * El filete de la página actual se pinta con `border-b-transparent` y no con
 * `border-transparent` a secas. Los dos escriben en propiedades distintas
 * —`border-bottom-color` frente a `border-color`— y sólo con la primera manda
 * de verdad la variante que la sustituye.
 */
export const navItemClass =
  "cursor-pointer border-b-[1.5px] border-b-transparent pb-[3px] text-paper/82 no-underline hover:text-paper aria-[current=page]:border-b-paper aria-[current=page]:text-paper";

/**
 * Un enlace de la navegación que sabe si es la página actual.
 *
 * Marca `aria-current="page"`, que es lo que hace que el filete de debajo
 * aparezca — y, más importante, lo que le dice a un lector de pantalla dónde
 * está quien navega. El subrayado solo no se lo diría a nadie.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link className={navItemClass} href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
