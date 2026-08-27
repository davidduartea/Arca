import Link from "next/link";

import { Shell } from "@/components/Shell";
import {
  StateCard,
  stateActionsClass,
  stateTextClass,
  stateTitleClass,
  stateVignetteClass,
} from "@/components/StateCard";
import { currentUser } from "@/modules/auth/queries";
import { button } from "@/styles/button";

/**
 * No se ha encontrado.
 *
 * Es también lo que sale al pedir la cuenta de otro, y el texto lo dice en voz
 * alta: **no distinguimos los dos casos**. Distinguirlos le diría a quien va
 * probando identificadores cuáles existen, y decirlo abiertamente convierte una
 * ambigüedad rara en una decisión visible — de paso, nadie sospecha un fallo.
 */
export default async function NotFound() {
  // Con sesión, la cabecera tiene que seguir siendo la del libro: si no, un 404
  // parecería haber cerrado la sesión.
  const user = await currentUser();

  return (
    <Shell signedIn={user !== null}>
      <StateCard mark="right">
        <img
          className={stateVignetteClass}
          src="/art/vig-ledger.svg"
          alt=""
          width={58}
          height={58}
        />
        <h1 className={stateTitleClass}>Esta página no está</h1>
        <p className={stateTextClass}>O no existe, o no es tuya. No decimos cuál de las dos.</p>

        <div className={stateActionsClass}>
          <Link
            className={button({ tone: "primary", size: "small" })}
            href={user ? "/accounts" : "/"}
          >
            {user ? "Ir a mis cuentas" : "Volver al principio"}
          </Link>
        </div>
      </StateCard>
    </Shell>
  );
}
