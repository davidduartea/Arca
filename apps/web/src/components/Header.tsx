import Link from "next/link";

import { Brand } from "@/components/Brand";
import { LedgerBar } from "@/components/LedgerBar";
import { navItemClass } from "@/components/NavLink";
import { currentUser } from "@/modules/auth/queries";

/**
 * La cabecera.
 *
 * Dos barras dentro del mismo marco: la pública, que invita a entrar, y la del
 * libro, que se pliega en el teléfono. El verde y la banda se pintan aquí una
 * sola vez — son el marco, y separarlos obligaría a mantener el ornamento en
 * dos sitios que tienen que salir idénticos.
 *
 * El correo se busca aquí, en el servidor, y baja resuelto a la barra. La
 * consulta no cuesta un viaje extra: `currentUser` está memorizada por petición
 * y el guardia del layout ya la ha hecho.
 */
export async function Header({ signedIn }: { signedIn: boolean }) {
  const user = signedIn ? await currentUser() : null;

  return (
    <header className="bg-green pt-[14px] text-paper">
      {/*
        Manda `signedIn` y no el correo. Si la API tose justo al pintar la
        cabecera, `user` viene vacío — y enseñarle «Abrir una cuenta» a alguien
        que está dentro de su libro sería peor que enseñar la barra sin el
        correo.
      */}
      {signedIn ? <LedgerBar email={user?.email ?? null} /> : <PublicBar />}

      {/*
        La banda va a sangre: se estira más allá del ancho de la caja. Más fina
        en el teléfono, porque a 390 px un canto de 15 px pesa tanto como la
        marca que tiene encima.
      */}
      <img
        className="h-[10px] w-full opacity-[0.38] nav:h-[15px]"
        src="/art/band-light.svg"
        alt=""
      />
    </header>
  );
}

/**
 * La barra de quien no ha entrado. No se pliega nunca.
 *
 * Son dos cosas y una es la llamada de la portada: esconderla detrás de tres
 * rayas sería esconder lo único que la página pide hacer.
 *
 * Es el único sitio de la aplicación donde el margen del teléfono cede a 20 px
 * en vez de 26 — la teja llega hasta su canto, y con el margen de siempre no
 * cabría entera a 390 px. Por eso el ancho se escribe a mano aquí y no sale de
 * `wrapClass`: es una excepción, y como excepción se ve.
 */
function PublicBar() {
  return (
    <div className="mx-auto w-full max-w-[980px] px-[20px] pb-[12px] nav:px-s5">
      <div className="flex items-center justify-between gap-s4">
        <Brand href="/" />

        <nav className="flex items-center gap-s4 text-[13px]" aria-label="Acceso">
          <Link className={navItemClass} href="/login">
            Acceder
          </Link>

          {/*
            La llamada invierte la teja: papel sobre verde. El `hover:` del
            color de letra no sobra — sin él, la regla general de los enlaces lo
            aclararía y el botón parecería otra cosa.
          */}
          <Link
            className="bg-paper px-[15px] py-[7px] font-medium text-green no-underline hover:text-green-light"
            href="/register"
          >
            Abrir una cuenta
          </Link>
        </nav>
      </div>
    </div>
  );
}
