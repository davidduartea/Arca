"use client";

import Link from "next/link";

import {
  StateCard,
  stateActionsClass,
  stateTextClass,
  stateTitleClass,
  stateVignetteClass,
} from "@/components/StateCard";
import { join } from "@/lib/join";
import { button } from "@/styles/button";
import { wrapClass } from "@/styles/layout";

/**
 * Algo se ha torcido.
 *
 * Sin este archivo, un fallo al renderizar deja la pantalla en blanco y sin
 * explicación. Tiene que ser un componente de cliente: es un límite de error de
 * React, y esos viven en el navegador.
 *
 * Tres decisiones:
 *
 * **No enseña el mensaje del error.** Puede traer dentro rutas del servidor o
 * trozos de una consulta, y quien mira no puede hacer nada con eso.
 *
 * **Sí dice que los datos están a salvo**, que es lo primero que uno piensa al
 * ver un fallo en una aplicación de dinero.
 *
 * **Y hay una salida además de reintentar.** Si el reintento vuelve a fallar,
 * un botón que sólo repite el fallo es una trampa.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={join(wrapClass, "py-s6")}>
      <StateCard mark="left">
        <img
          className={stateVignetteClass}
          src="/art/vig-broken.svg"
          alt=""
          width={58}
          height={58}
        />
        <h1 className={stateTitleClass}>La plancha salió mal</h1>
        <p className={stateTextClass}>
          No hemos podido dibujar esta página. Tus movimientos están intactos.
        </p>

        <div className={stateActionsClass}>
          <button
            className={button({ tone: "primary", size: "small" })}
            type="button"
            onClick={reset}
          >
            Reintentar
          </button>
          <Link className={button({ size: "small" })} href="/accounts">
            Ir a cuentas
          </Link>
        </div>

        {/* El código del fallo: corto, copiable, al pie y sin estorbar. */}
        <p className="mt-s4 font-mono text-[10.5px] tracking-[0.06em] text-ink-4 select-all">
          {shortCode(error.digest)}
        </p>
      </StateCard>
    </div>
  );
}

/**
 * Un código corto que se pueda dictar a soporte.
 *
 * Next da un `digest` largo del error real, que queda en sus registros. Aquí se
 * enseñan sus tres últimos caracteres: suficiente para cruzarlo con el registro
 * y demasiado poco para deducir nada.
 */
function shortCode(digest: string | undefined): string {
  return `ERR·${(digest ?? "000").slice(-3).toUpperCase()}`;
}
