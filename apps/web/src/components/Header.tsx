import Link from "next/link";

import { NavLink, navItemClass } from "@/components/NavLink";
import { signOut } from "@/modules/auth/actions";
import { wrapClass } from "@/styles/layout";

/**
 * La cabecera.
 *
 * Dos formas: la pública, que invita a entrar, y la del libro, con la
 * navegación. Es el mismo componente porque la marca y la banda son idénticas
 * y separarlas obligaría a mantener el ornamento en dos sitios.
 */
export function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="bg-green pt-[14px] text-paper">
      <div className={wrapClass}>
        <div className="flex flex-wrap items-center justify-between gap-s4">
          <Link
            className="flex items-center gap-[11px] text-paper no-underline"
            href={signedIn ? "/accounts" : "/"}
          >
            <img
              className="h-[28px] w-[28px]"
              src="/art/symbol-a-light.svg"
              alt=""
              width={28}
              height={28}
            />
            <span className="font-serif text-[23px] leading-none tracking-[0.07em]">Arca</span>
          </Link>

          {signedIn ? <LedgerNav /> : <PublicNav />}
        </div>
      </div>

      {/* La banda va a sangre: se estira más allá del ancho de la caja. */}
      <img
        className="mt-[12px] h-[15px] w-full opacity-[0.38]"
        src="/art/band-light.svg"
        alt=""
      />
    </header>
  );
}

/** Los enlaces van separados por s4 y la letra es más pequeña que la del cuerpo. */
const NAV = "flex items-center gap-s4 text-[13px]";

function LedgerNav() {
  return (
    <nav className={NAV} aria-label="El libro">
      <NavLink href="/accounts">Cuentas</NavLink>
      <NavLink href="/transfers">Transferir</NavLink>
      <NavLink href="/deposits">Ingresar</NavLink>
      {/*
        Cerrar sesión es un formulario y no un enlace, porque cambia estado en
        el servidor: borra la cookie. Un GET no debería hacer eso — bastaría con
        que algo precargara el enlace para echar a alguien de su sesión.
      */}
      <form action={signOut}>
        <button className={navItemClass} type="submit">
          Salir
        </button>
      </form>
    </nav>
  );
}

function PublicNav() {
  return (
    <nav className={NAV} aria-label="Acceso">
      <Link className={navItemClass} href="/login">
        Acceder
      </Link>

      {/*
        La llamada invierte la teja: papel sobre verde. El `hover:` del color de
        letra no sobra — sin él, la regla general de los enlaces lo aclararía y
        el botón parecería otra cosa.
      */}
      <Link
        className="bg-paper px-[15px] py-[7px] font-medium text-green no-underline hover:text-green-light"
        href="/register"
      >
        Abrir una cuenta
      </Link>
    </nav>
  );
}
