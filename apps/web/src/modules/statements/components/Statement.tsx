"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { SplitNote } from "@/components/SplitNote";
import { join } from "@/lib/join";
import { formatSigned, formatUsd } from "@/lib/money";
import type { StatementLineView } from "@/models/statements/StatementLineView";
import type { StatementPageView } from "@/models/statements/StatementPageView";
import { getStatement } from "@/modules/statements/actions";
import { formatDay, formatMoment } from "@/modules/statements/date";
import { reverseTransaction } from "@/modules/transfers/actions";
import { button } from "@/styles/button";

/** La cabecera de la tabla: filete grueso debajo, versalitas muy espaciadas. */
const HEAD =
  "border-b-[1.5px] border-b-green pb-[7px] text-right font-mono text-[9.5px] font-medium tracking-[0.16em] whitespace-nowrap text-ink-4 uppercase";

/**
 * Lo que comparte cualquier celda **cuando la tabla es una tabla**.
 *
 * Todo va detrás de `nav:` porque por debajo de ese ancho no hay celdas: la
 * fila se convierte en una rejilla y estas propiedades pintarían un filete fino
 * debajo de cada dato en vez de uno debajo del movimiento entero.
 */
const CELL = "nav:table-cell nav:border-b nav:border-b-hair nav:py-[12px] nav:align-top";

/** Las dos columnas de cifras miden lo mismo, o la vista se descuadra al paginar. */
const NUMBER_COLUMN = "text-right font-mono whitespace-nowrap tabular-nums nav:w-[118px]";

/**
 * Qué es una anulación, dicho con palabras.
 *
 * Aparece en dos sitios —pegado a la fecha en el escritorio, en línea aparte en
 * el teléfono— y por eso vive en una constante: son el mismo dato, y si un día
 * cambia la frase tiene que cambiar en los dos a la vez.
 */
const REVERSAL_NOTE = "anula un movimiento anterior";

/**
 * El extracto, del movimiento más reciente al más antiguo.
 *
 * La paginación es **por cursor**: no hay números de página y no se sabe
 * cuántas quedan. El servidor sólo sabe si queda algo detrás, y eso es
 * deliberado — un `OFFSET` se mide sobre un resultado que se mueve, y en un
 * extracto bancario eso significa un movimiento duplicado, o uno que
 * desaparece, cuando entra algo nuevo entre página y página.
 */
export function Statement({
  accountId,
  firstPage,
  openedAt,
}: {
  accountId: string;
  firstPage: StatementPageView;
  openedAt: string;
}) {
  const [lines, setLines] = useState(firstPage.lines);
  const [cursor, setCursor] = useState(firstPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * Cuando el servidor manda una primera página nueva, lo cargado se tira.
   *
   * Pasa al anular: la acción invalida la ruta y `router.refresh()` vuelve a
   * pintar la pantalla desde el servidor. Sin esto, `useState` se quedaría con
   * las líneas del primer render para siempre y la anulación no aparecería —
   * el saldo de la cabecera cambiaría delante de una lista que sigue diciendo
   * lo de antes, que es peor que no refrescar nada.
   *
   * Se descartan también las páginas que se hubieran cargado con «Cargar más»,
   * y es lo correcto: sus saldos corrientes se calcularon contando desde una
   * primera página que ya no es cierta.
   *
   * Va en el cuerpo del render y no en un efecto a propósito. Es el patrón que
   * React documenta para ajustar estado cuando cambia una propiedad: así se
   * corrige antes de pintar, en vez de pintar mal y volver a pintar.
   */
  const [rendered, setRendered] = useState(firstPage);

  if (rendered !== firstPage) {
    setRendered(firstPage);
    setLines(firstPage.lines);
    setCursor(firstPage.nextCursor);
    setFailed(false);
  }

  async function loadMore() {
    if (!cursor || loading) return;

    setLoading(true);
    setFailed(false);

    try {
      const next = await getStatement(accountId, cursor);

      setLines((current) => [...current, ...next.lines]);
      setCursor(next.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (lines.length === 0) return <BlankStatement />;

  return (
    <>
      {/*
        Una tabla, dos formas.

        Por debajo de `nav` deja de comportarse como tabla —`block` arriba,
        rejilla en cada fila— y por encima vuelve a serlo. Es una sola lista en
        el documento y no dos escondidas por turnos: duplicar el marcado
        significaría duplicar también cada página que se carga después.

        La cabecera de columnas se va con las columnas. Sin ellas no describe
        nada: repetiría lo que cada fila ya dice, y lo que hacía —separar el
        importe del saldo— lo hace ahora la palabra «queda».
      */}
      <table className="block w-full border-collapse nav:table">
        <thead className="hidden nav:table-header-group">
          <tr>
            <th className={`${HEAD} text-left`} scope="col">
              Movimiento
            </th>
            <th className={HEAD} scope="col">
              Importe
            </th>
            <th className={HEAD} scope="col">
              Saldo después
            </th>
          </tr>
        </thead>
        <tbody className="block nav:table-row-group">
          {lines.map((line) => (
            <Row key={line.entryId} line={line} accountId={accountId} />
          ))}
        </tbody>
      </table>

      {loading && <LoadingRows />}

      {failed && (
        <Notice className="mt-s3">
          No se pudo traer el resto del extracto. Vuelve a intentarlo.
        </Notice>
      )}

      {cursor !== null && !loading && (
        <div className="pt-s4 pb-s1 text-center">
          {/* A ancho completo en el teléfono: es la única acción de la lista. */}
          <button
            className={button({ className: "w-full nav:w-auto" })}
            type="button"
            onClick={() => void loadMore()}
          >
            Cargar más
          </button>
          <p className="mt-s2 font-mono text-[10.5px] leading-[1.5] text-ink-4">
            <SplitNote first="paginación por cursor" second="no hay número de páginas" />
          </p>
        </div>
      )}

      {cursor === null && <TheBeginning openedAt={openedAt} count={lines.length} />}
    </>
  );
}

/**
 * Un movimiento.
 *
 * En el teléfono deja de ser una fila y se apila en dos: la descripción manda
 * la primera línea con el importe a su derecha, y debajo la fecha con el saldo
 * colgado. Lo que antes separaba la columna lo separan ahora el tamaño, el tono
 * y una palabra — «queda».
 *
 * La descripción es lo único de largo variable, así que en tres columnas se
 * quedaba con 102 px de 338 y una frase corriente se partía en seis líneas.
 * Apilada se lleva el ancho entero.
 */
function Row({ line, accountId }: { line: StatementLineView; accountId: string }) {
  const incoming = !line.amount.startsWith("-");

  /**
   * La anulación se marca en las **dos** líneas: la que corrige y la corregida.
   * Son las dos mitades de una misma enmienda y se leen juntas o no se leen.
   */
  const amended = line.isReversal || line.isReversed;

  /**
   * Se devuelve lo que entró, y una sola vez.
   *
   * No se ofrece sobre una anulación: devolver una devolución es volver a
   * mandar el dinero, y para eso está transferir. La API sí lo permitiría —
   * quien lo recibió es su dueño— pero invitarlo desde aquí sólo confunde.
   */
  const returnable = incoming && !line.isReversed && !line.isReversal;

  return (
    <tr
      className={join(
        // El estilo del filete va por su lado y no con `border-dashed`, que se
        // aplica a los cuatro: el de la anulación es continuo, y discontinuo
        // parecería el borde de una tabla a medio pintar.
        "grid grid-cols-[1fr_auto] items-baseline gap-x-s3 gap-y-[4px] border-b [border-bottom-style:dashed] border-b-green/28 py-[12px]",
        "nav:table-row nav:border-b-0 nav:py-0",
        /*
          El filete de la anulación cruza el movimiento entero cuando está
          apilado, así que vive en la fila; en la tabla marca sólo la primera
          celda y lo pone ella. El margen negativo lo saca al margen de la
          página para que la sangría no le robe ancho a la descripción — y son
          exactamente los 3 px del filete más los 13 de la sangría, así que las
          cinco descripciones siguen cayendo en la misma vertical.
        */
        amended &&
          "-ml-[16px] border-l-[3px] border-l-green pl-[13px] nav:ml-0 nav:border-l-0 nav:pl-0",
      )}
    >
      {/*
        La celda desaparece en el teléfono —`contents`— y sus tres hijos pasan a
        ser casillas de la rejilla de la fila. Sin eso la fecha no podría
        sentarse al lado del saldo: estaría encerrada aquí dentro.

        La anulación se marca de tres maneras — rombo, filete y sangría — y
        ninguna es el color. Quien no distinga tonos la ve igual.
      */}
      <td
        className={join(
          CELL,
          "contents nav:pr-s4",
          amended && "nav:border-l-[3px] nav:border-l-green nav:pl-[10px]",
        )}
      >
        <span
          className={join(
            "col-start-1 row-start-1 text-[15px] leading-[1.35] text-pretty nav:text-[14.5px]",
            amended && "flex items-baseline gap-[7px]",
            // Tachado y apagado: lo que se lee ahí ya no cuenta para el saldo.
            // El tachón no va solo — lleva su rombo, su filete y la etiqueta de
            // abajo, porque una raya encima de un texto la pierde quien tenga
            // la vista justa.
            line.isReversed && "text-ink-3 line-through",
          )}
        >
          {amended && (
            <img
              className={join(
                "w-[18px] flex-none -translate-y-[2px] nav:w-[22px]",
                line.isReversed && "opacity-60",
              )}
              src="/art/lozenge.svg"
              alt=""
              width={22}
              height={11}
            />
          )}
          {line.description}
        </span>

        <time
          className="col-start-1 row-start-2 font-mono text-[11.5px] text-ink-4 nav:mt-[2px] nav:block nav:text-[11px]"
          dateTime={line.createdAt}
        >
          {formatMoment(line.createdAt)}
          {line.isReversal && <span className="hidden nav:inline"> · {REVERSAL_NOTE}</span>}
        </time>

        {/*
          La tercera línea, que cada fila usa para una cosa y sólo una: los tres
          casos se excluyen entre sí. Una anulación explica qué es, lo anulado
          lo lleva escrito, y lo que entró y sigue en pie ofrece devolverse.
        */}
        {line.isReversal && (
          <span className="col-start-1 col-end-3 row-start-3 font-mono text-[11px] text-ink-4 nav:hidden">
            {REVERSAL_NOTE}
          </span>
        )}

        {line.isReversed && (
          <span className="col-start-1 col-end-3 row-start-3 mt-[5px] inline-block w-fit border border-green/45 px-[6px] py-[1.5px] font-mono text-[9.5px] tracking-[0.14em] text-green uppercase">
            Anulado
          </span>
        )}

        {returnable && (
          <span className="col-start-1 col-end-3 row-start-3 mt-[5px] block">
            <Reverse
              transactionId={line.transactionId}
              accountId={accountId}
              amount={line.amount}
            />
          </span>
        )}
      </td>

      {/* Lo que entra pesa un poco más. Ni una gota de color. */}
      <td
        className={join(
          CELL,
          NUMBER_COLUMN,
          "col-start-2 row-start-1 text-[14px]",
          incoming && "font-medium",
        )}
      >
        {formatSigned(line.amount)}
      </td>

      <td
        className={join(
          CELL,
          NUMBER_COLUMN,
          "col-start-2 row-start-2 text-[11.5px] text-ink-3 nav:text-[13px]",
        )}
      >
        {/* La palabra hace el trabajo que hacía la cabecera de la columna. */}
        <span className="nav:hidden">queda </span>
        {formatUsd(line.balance)}
      </td>
    </tr>
  );
}

/** Un enlace de texto que en realidad es un botón: no navega, hace algo. */
const TEXT_BUTTON =
  "cursor-pointer border-b border-b-green/40 text-[11.5px] text-green hover:border-b-green";

/**
 * Devolver un movimiento, con la pregunta en el sitio del botón.
 *
 * Mismo principio que al cerrar todas las sesiones: **no hay capa flotante**.
 * En este sistema no hay sombras, y un diálogo por encima de una fila de
 * extracto obligaría a inventar una. La fila crece hacia abajo y empuja lo de
 * debajo, que es lo que ya hace el menú del teléfono y la confirmación de la
 * cuenta.
 *
 * A escala de fila la pregunta no lleva caja propia: el filete verde de la
 * izquierda que ya marca la enmienda haría dos marcos concéntricos por una
 * pregunta de una línea.
 */
function Reverse({
  transactionId,
  accountId,
  amount,
}: {
  transactionId: string;
  accountId: string;
  amount: string;
}) {
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const router = useRouter();
  const question = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // El botón que tenía el foco desaparece al preguntar. Sin mover el foco a
    // la pregunta, quien navega con teclado se queda sin saber qué ha pasado.
    if (asking) question.current?.focus();
  }, [asking]);

  async function confirm() {
    setSending(true);
    setProblem(null);

    const result = await reverseTransaction(transactionId, accountId);

    if ("error" in result) {
      setProblem(result.error);
      setSending(false);
      return;
    }

    // Las líneas no se recomponen aquí: la acción ya invalidó la ruta y
    // `refresh` trae el extracto rehecho por el servidor, con la anulación
    // dentro y todos los saldos corrientes recalculados. Hacer esa cuenta en el
    // navegador sería escribirla dos veces, y la del servidor es la buena.
    //
    // Al llegar esas líneas esta fila deja de poder devolverse y el botón
    // desaparece con ella. Pero si algo saliera distinto de lo previsto, dejarlo
    // en «Devolviendo…» para siempre sería mentir sobre lo que está pasando.
    router.refresh();
    setSending(false);
  }

  if (!asking) {
    return (
      <button
        className={TEXT_BUTTON}
        type="button"
        onClick={() => {
          setAsking(true);
        }}
      >
        Devolver
      </button>
    );
  }

  return (
    <span className="block">
      <p className="text-[12.5px] outline-none" ref={question} tabIndex={-1}>
        ¿Devolver {formatUsd(amount)}?{" "}
        <span className="text-ink-3">
          Se anula con otro asiento y los dos se quedan en el extracto.
        </span>
      </p>

      <span className="mt-s2 flex flex-wrap items-center gap-s3">
        <button
          className={button({ tone: "primary", size: "tiny" })}
          type="button"
          onClick={() => void confirm()}
          disabled={sending}
        >
          {sending ? "Devolviendo…" : "Sí, devolver"}
        </button>

        <button
          className={TEXT_BUTTON}
          type="button"
          onClick={() => {
            setAsking(false);
            setProblem(null);
          }}
          disabled={sending}
        >
          Dejarlo
        </button>
      </span>

      {problem !== null && (
        <span className="mt-s2 block text-[11.5px] text-ink-2" role="alert">
          {problem}
        </span>
      )}
    </span>
  );
}

/** Cuenta sin movimientos. El saldo es $0.00, que no es lo mismo que vacío. */
function BlankStatement() {
  return (
    // El aire entre el filete grueso y la tarjeta lo pone ella: en el teléfono
    // el filete lo pinta la pantalla y quedarían los dos bordes pegados. En el
    // escritorio ese hueco ya lo deja la consulta por fecha de encima.
    <EmptyState className="mt-s4 nav:mt-0">
      <img
        className="mx-auto mb-s1 w-[56px]"
        src="/art/vig-ledger.svg"
        alt=""
        width={56}
        height={56}
      />
      <h2 className="mb-s1 text-[20px]">Extracto en blanco</h2>
      <p className="mb-s4 text-[13px] text-ink-3">
        El saldo es $0.00 porque todavía no hay nada que sumar.
      </p>
      <a className={button({ tone: "primary" })} href="/deposits">
        Ingresar dinero
      </a>
    </EmptyState>
  );
}

/** El final: aquí empieza la cuenta. */
function TheBeginning({ openedAt, count }: { openedAt: string; count: number }) {
  return (
    <div className="pt-s5 pb-s2 text-center">
      <img
        className="mx-auto w-[240px]"
        src="/art/vig-end.svg"
        alt=""
        width={240}
        height={38}
      />
      <h2 className="mt-[2px] text-[17px]">Aquí empieza la cuenta</h2>
      <p className="mt-[3px] font-mono text-[10.5px] text-ink-4">
        {formatDay(openedAt)} · {count} {count === 1 ? "asiento" : "asientos"}
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-s2 py-s4" aria-live="polite">
      <div className="h-[9px] w-full bg-green/10" />
      <div className="h-[9px] w-[88%] bg-green/10" />
      <div className="h-[9px] w-[94%] bg-green/10" />
      <p className="text-center text-[12px] text-ink-4">cargando…</p>
    </div>
  );
}
