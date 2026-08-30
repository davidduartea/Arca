"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Brand } from "@/components/Brand";
import { NavLink, navItemClass } from "@/components/NavLink";
import { signOut } from "@/modules/auth/actions";
import { NAV_BREAKPOINT, wrapClass } from "@/styles/layout";

/**
 * La barra del libro: tendida en el escritorio, plegada en el teléfono.
 *
 * Es de cliente porque el menú tiene un estado —abierto o cerrado— y no hay
 * forma honesta de tenerlo sin JavaScript: el truco de la casilla escondida
 * deja un control marcado que los lectores de pantalla anuncian como lo que es,
 * una casilla, y no como un botón que despliega.
 *
 * El correo llega ya resuelto desde el servidor. `currentUser` importa
 * `server-only` y rompería el build si asomara por aquí, que es exactamente lo
 * que tiene que pasar.
 *
 * **Empuja, no flota.** El menú crece dentro de la banda verde y baja la
 * página. En este sistema no hay sombras, y sin sombra no hay manera de
 * levantar una capa por encima del papel sin que parezca un error de pintado;
 * es la misma razón por la que la confirmación de «cerrar sesiones» crece en su
 * sitio en vez de abrir un diálogo.
 */
export function LedgerBar({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => {
    setOpen(false);
  };

  /**
   * El menú no sobrevive al cambio de página.
   *
   * La barra vive en el layout, así que navegar no la desmonta: sin esto, el
   * menú seguiría desplegado encima de la pantalla nueva. Se cierra al cambiar
   * la ruta y no al tocar el enlace, para que el menú siga en pie mientras la
   * página tarda en llegar y no parezca que el toque no ha hecho nada.
   */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  /**
   * Con el menú abierto, la página se queda quieta.
   *
   * Si se pudiera desplazar por detrás, la equis se iría de la pantalla y
   * cerrar el menú obligaría a volver arriba a buscarla.
   *
   * Y se cierra solo al ensancharse la pantalla. Girar el teléfono con el menú
   * abierto lo cruza al ancho donde la barra va tendida: allí el menú está
   * escondido por CSS, así que sin esto quedaría una página que no se desplaza
   * y ningún control a la vista para arreglarlo.
   */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const wide = window.matchMedia(`(min-width: ${NAV_BREAKPOINT}px)`);
    wide.addEventListener("change", close);

    return () => {
      document.body.style.overflow = previous;
      wide.removeEventListener("change", close);
    };
  }, [open]);

  return (
    <>
      {/*
        Los 12 px de abajo son el hueco entre la barra y lo que venga después:
        la banda cuando está cerrada, el menú cuando está abierto. Por eso van
        aquí y no en la banda — si fueran suyos, con el menú desplegado
        aparecerían en medio, entre la última fila y el ornamento.
      */}
      <div className={`${wrapClass} pb-[12px]`}>
        <div className="flex items-center justify-between gap-s4">
          <Brand href="/accounts" />

          <nav
            className="hidden items-center gap-s4 text-[13px] nav:flex"
            aria-label="El libro"
          >
            <NavLink href="/accounts">Cuentas</NavLink>
            <NavLink href="/transfers">Transferir</NavLink>
            <NavLink href="/deposits">Ingresar</NavLink>

            {/*
              A «Tu cuenta» se entra por el correo, no por un icono de persona:
              el correo dice **con cuál** de tus cuentas estás dentro, que es la
              pregunta que de verdad se hace quien mira ahí arriba.
            */}
            {email && <NavLink href="/account">{email}</NavLink>}

            {/*
              Cerrar sesión es un formulario y no un enlace, porque cambia
              estado en el servidor: borra la cookie. Un GET no debería hacer
              eso — bastaría con que algo precargara el enlace para echar a
              alguien de su sesión.
            */}
            <form action={signOut}>
              <button className={navItemClass} type="submit">
                Salir
              </button>
            </form>
          </nav>

          <Toggle
            open={open}
            onToggle={() => {
              setOpen(!open);
            }}
          />
        </div>
      </div>

      {open && (
        <nav
          id="ledger-menu"
          className="border-t border-t-paper/22 nav:hidden"
          aria-label="El libro"
        >
          <MenuItem href="/accounts" current={at(pathname, "/accounts")} onClose={close}>
            Cuentas
          </MenuItem>
          <MenuItem href="/transfers" current={at(pathname, "/transfers")} onClose={close}>
            Transferir
          </MenuItem>
          <MenuItem href="/deposits" current={at(pathname, "/deposits")} onClose={close}>
            Ingresar
          </MenuItem>

          {email && (
            <MenuItem href="/account" current={at(pathname, "/account")} onClose={close}>
              {/*
                El correo se recorta por delante y conserva entera la parte de
                la arroba: lo que dice en qué cuenta estás es el dominio, no las
                primeras letras. `direction: rtl` mueve el final de la línea al
                borde izquierdo, que es donde el navegador pone los puntos
                suspensivos; el texto se sigue leyendo de izquierda a derecha
                porque es una tirada latina entera. `text-left` es para cuando
                sí cabe — sin él quedaría pegado al borde contrario que las
                demás filas.
              */}
              <span className="min-w-0 truncate text-left [direction:rtl]">{email}</span>
            </MenuItem>
          )}

          {/* La última fila no lleva filete: lo pone la banda. */}
          <form action={signOut}>
            <button className={`${MENU_ROW} ${MENU_QUIET}`} type="submit">
              Salir
            </button>
          </form>
        </nav>
      )}
    </>
  );
}

/** ¿Es ésta la página? Igual criterio que `NavLink`, para que no discrepen. */
function at(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Las cinco filas son la misma fila.
 *
 * Mismo alto, mismo aire y misma letra para los cuatro enlaces y para el botón
 * de salir: nada delata el tipo de control, porque para quien lo toca no hay
 * diferencia entre ir a un sitio y cerrar la sesión — las dos cosas se piden
 * igual.
 */
const MENU_ROW =
  "relative flex w-full cursor-pointer items-center gap-s3 px-s5 py-[14px] text-left text-[16px] no-underline";

const MENU_RULE = "border-b border-b-paper/22";
const MENU_QUIET = "text-paper/82 hover:text-paper";
const MENU_CURRENT = "bg-paper/5 text-paper";

function MenuItem({
  href,
  current,
  onClose,
  children,
}: {
  href: string;
  current: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={`${MENU_ROW} ${MENU_RULE} ${current ? MENU_CURRENT : MENU_QUIET}`}
      href={href}
      aria-current={current ? "page" : undefined}
      // Ir a donde ya estás no cambia la ruta, así que el efecto que cierra el
      // menú al navegar no llegaría a dispararse nunca: ese caso se cierra aquí.
      onClick={current ? onClose : undefined}
    >
      {/*
        El filete de la página actual va absoluto y no en la fila.
        Ocupando sitio empujaría su texto tres píxeles a la derecha del de las
        otras cuatro, y un escalón así en una columna de cinco líneas se lee
        como un fallo antes que como una marca.
      */}
      {current && (
        <span className="absolute top-1/2 left-[13px] h-[19px] w-[3px] -translate-y-1/2 bg-paper" />
      )}

      {children}

      {/*
        «Estás aquí» es el filete dicho con palabras, para quien no distingue
        tres píxeles de blanco. A un lector de pantalla se lo cuenta
        `aria-current`, así que oírlo dos veces sobra: de ahí el `aria-hidden`.
      */}
      {current && (
        <span
          className="ml-auto shrink-0 font-mono text-[9.5px] tracking-[0.16em] text-paper/55 uppercase"
          aria-hidden="true"
        >
          Estás aquí
        </span>
      )}
    </Link>
  );
}

/**
 * Tres rayas, o una equis.
 *
 * El área tocable mide 44 × 44 px y se mete en el margen; el dibujo se queda en
 * los 26 px de la columna. El dedo agradece el hueco de más y la retícula no se
 * entera: lo que se ve sigue alineado con el borde del contenido.
 */
function Toggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className="-mr-[11px] flex h-[44px] w-[44px] cursor-pointer items-center justify-end pr-[11px] nav:hidden"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="ledger-menu"
      aria-label={open ? "Cerrar el menú" : "Abrir el menú"}
    >
      {open ? (
        <span className="relative block h-[22px] w-[22px]">
          <span className="absolute top-[10px] left-0 h-[1.5px] w-[22px] rotate-45 bg-paper" />
          <span className="absolute top-[10px] left-0 h-[1.5px] w-[22px] -rotate-45 bg-paper" />
        </span>
      ) : (
        <span className="flex flex-col items-end gap-[5px]">
          <span className="h-[1.5px] w-[22px] bg-paper" />
          <span className="h-[1.5px] w-[22px] bg-paper" />
          <span className="h-[1.5px] w-[22px] bg-paper" />
        </span>
      )}
    </button>
  );
}
