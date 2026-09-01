"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { renameAccount, setAccountClosed } from "@/modules/accounts/actions";
import { button } from "@/styles/button";
import { fieldClass, hintClass, inputClass, labelClass } from "@/styles/form";
import { eyebrowClass } from "@/styles/layout";

/**
 * Renombrar y cerrar, al final del extracto y plegado.
 *
 * Va **detrás de los movimientos** y no en la cabecera a propósito: esta
 * pantalla se abre cien veces para mirar el saldo y dos en la vida para
 * administrar la cuenta. Poner un formulario donde se mira una cifra es cobrar
 * a las cien visitas el precio de las dos.
 *
 * Y arranca cerrado, como la consulta por fecha, con el mismo disparador de
 * `aria-expanded`. Es el único patrón de plegado que tiene el proyecto y no
 * hace falta inventar otro.
 */
export function AccountSettings({
  accountId,
  name,
  closed,
  balance,
}: {
  accountId: string;
  name: string;
  closed: boolean;

  /** Sólo para saber cuándo caduca el «todavía tiene $25.00». Ver `Closure`. */
  balance: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-s6 border-t-[1.5px] border-t-rule pt-s3">
      <button
        className={`${eyebrowClass} cursor-pointer text-ink-3 hover:text-ink`}
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? "Ajustes de la cuenta ▴" : "Ajustes de la cuenta ▾"}
      </button>

      {open && (
        <div className="mt-s3 max-w-[560px]">
          <Rename accountId={accountId} name={name} />
          <Closure accountId={accountId} closed={closed} balance={balance} />
        </div>
      )}
    </section>
  );
}

function Rename({ accountId, name }: { accountId: string; name: string }) {
  const [state, act, pending] = useActionState(renameAccount, EMPTY_FORM);
  const [typed, setTyped] = useState(name);

  // El nombre nuevo llega como propiedad cuando el servidor repinta, y sin esto
  // el campo se quedaría con lo que había al montarse. Mismo caso que en el
  // extracto: `useState` no se entera de una propiedad nueva.
  const [rendered, setRendered] = useState(name);
  if (rendered !== name) {
    setRendered(name);
    setTyped(name);
  }

  const unchanged = typed.trim() === name || typed.trim() === "";

  return (
    <form action={act}>
      {state.error && <Notice className="mb-s3">{state.error}</Notice>}

      <input type="hidden" name="accountId" value={accountId} />

      <div className="flex items-end gap-s3">
        <div className={`${fieldClass} flex-1`}>
          <label className={labelClass} htmlFor="account-rename">
            Nombre de la cuenta
          </label>
          <input
            className={inputClass}
            id="account-rename"
            name="name"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            maxLength={80}
            required
          />
        </div>

        <button className={button()} type="submit" disabled={pending || unchanged}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/*
        «Guardado.» sólo mientras lo guardado es lo que se está viendo. En
        cuanto se vuelve a escribir deja de ser cierto, y una confirmación que
        ya no corresponde a lo que hay en el campo confunde más que ayuda.
      */}
      <span className={hintClass}>
        {state.ok && unchanged
          ? "Guardado."
          : "Sólo lo ves tú. Quien te transfiere ve tu nombre, no el de la cuenta."}
      </span>
    </form>
  );
}

/**
 * Cerrar y reabrir.
 *
 * Cerrar pregunta antes; reabrir no. No es incoherencia: cerrar quita algo —la
 * cuenta deja de poder recibir en un número que su dueño ya repartió— y reabrir
 * lo devuelve. Se confirma lo que quita.
 *
 * La pregunta va en el sitio del botón y sin capa flotante, como al devolver un
 * movimiento: en este sistema no hay sombras.
 */
function Closure({
  accountId,
  closed,
  balance,
}: {
  accountId: string;
  closed: boolean;
  balance: string;
}) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const router = useRouter();
  const question = useRef<HTMLParagraphElement>(null);

  /**
   * El «todavía tiene $25.00» caduca cuando deja de tener $25.00.
   *
   * Pasa en la misma pantalla: se intenta cerrar, la API se niega diciendo
   * cuánto queda, y desde ahí mismo se devuelve el movimiento que sobraba. El
   * saldo de la cabecera baja a cero y el aviso seguiría ahí, contando algo que
   * ya no es verdad. Comparar la identidad del saldo durante el render es lo
   * que lo retira — el mismo patrón que resincroniza el extracto.
   */
  const [rendered, setRendered] = useState(balance);
  if (rendered !== balance) {
    setRendered(balance);
    setProblem(null);
  }

  useEffect(() => {
    // El botón que tenía el foco desaparece al preguntar.
    if (asking) question.current?.focus();
  }, [asking]);

  async function apply(next: boolean) {
    setSending(true);
    setProblem(null);

    const result = await setAccountClosed(accountId, next);

    if ("error" in result) {
      setProblem(result.error);
      setSending(false);
      return;
    }

    setAsking(false);
    setSending(false);
    router.refresh();
  }

  if (closed) {
    return (
      <div className="mt-s5 border-t border-t-hair pt-s3">
        <p className="text-[13px] text-ink-2">
          Esta cuenta está cerrada: no manda ni recibe dinero. Sus movimientos siguen aquí.
        </p>

        <button
          className={button({ className: "mt-s3" })}
          type="button"
          onClick={() => void apply(false)}
          disabled={sending}
        >
          {sending ? "Abriendo…" : "Volver a abrirla"}
        </button>

        {problem !== null && (
          <p className="mt-s2 text-[12px] text-ink-2" role="alert">
            {problem}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-s5 border-t border-t-hair pt-s3">
      {asking ? (
        <>
          <p className="text-[13px] outline-none" ref={question} tabIndex={-1}>
            ¿Cerrar esta cuenta?{" "}
            <span className="text-ink-3">
              Dejará de mandar y de recibir, y su número dejará de resolverse. Los movimientos
              se quedan y puedes volver a abrirla cuando quieras.
            </span>
          </p>

          <div className="mt-s3 flex flex-wrap items-center gap-s3">
            <button
              className={button({ tone: "primary" })}
              type="button"
              onClick={() => void apply(true)}
              disabled={sending}
            >
              {sending ? "Cerrando…" : "Sí, cerrarla"}
            </button>
            <button
              className={button()}
              type="button"
              onClick={() => {
                setAsking(false);
                setProblem(null);
              }}
              disabled={sending}
            >
              Dejarlo
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">
            Cerrarla la saca de circulación sin borrar nada. Hace falta que esté a cero.
          </p>

          <button
            className={button({ className: "mt-s3" })}
            type="button"
            onClick={() => {
              setAsking(true);
            }}
          >
            Cerrar la cuenta
          </button>
        </>
      )}

      {problem !== null && (
        <p className="mt-s2 text-[12px] text-ink-2" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
