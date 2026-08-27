"use client";

import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { join } from "@/lib/join";
import { formatSigned, formatUsd } from "@/lib/money";
import type { StatementLineView } from "@/models/statements/StatementLineView";
import type { StatementPageView } from "@/models/statements/StatementPageView";
import { getStatement } from "@/modules/statements/actions";
import { button } from "@/styles/button";

/** La cabecera de la tabla: filete grueso debajo, versalitas muy espaciadas. */
const HEAD =
  "border-b-[1.5px] border-b-green pb-[7px] text-right font-mono text-[9.5px] font-medium tracking-[0.16em] whitespace-nowrap text-ink-4 uppercase";

/** Lo que comparte cualquier celda: el filete fino que separa filas. */
const CELL = "border-b border-b-hair py-[12px] align-top";

/** Las dos columnas de cifras miden lo mismo, o la vista se descuadra al paginar. */
const NUMBER_COLUMN = "w-[118px] text-right font-mono whitespace-nowrap tabular-nums";

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
      {/* La tabla no se estrecha: en un móvil se desliza dentro de su caja. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
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
          <tbody>
            {lines.map((line) => (
              <Row key={line.entryId} line={line} />
            ))}
          </tbody>
        </table>
      </div>

      {loading && <LoadingRows />}

      {failed && (
        <Notice className="mt-s3">
          No se pudo traer el resto del extracto. Vuelve a intentarlo.
        </Notice>
      )}

      {cursor !== null && !loading && (
        <div className="pt-s4 pb-s1 text-center">
          <button className={button()} type="button" onClick={() => void loadMore()}>
            Cargar más
          </button>
          <p className="mt-s2 font-mono text-[10.5px] text-ink-4">
            paginación por cursor · no hay número de páginas
          </p>
        </div>
      )}

      {cursor === null && <TheBeginning openedAt={openedAt} count={lines.length} />}
    </>
  );
}

function Row({ line }: { line: StatementLineView }) {
  const incoming = !line.amount.startsWith("-");

  return (
    <tr>
      {/*
        La anulación se marca de tres maneras — rombo, filete y sangría — y
        ninguna es el color. Quien no distinga tonos la ve igual.
      */}
      <td
        className={join(
          CELL,
          "pr-s4 text-[14.5px]",
          line.isReversal &&
            "-ml-[13px] flex items-start gap-[9px] border-l-[3px] border-l-green pl-[10px]",
        )}
      >
        {line.isReversal && (
          <img
            className="mt-[6px] w-[22px] flex-none"
            src="/art/lozenge.svg"
            alt=""
            width={22}
            height={11}
          />
        )}
        <span>
          {line.description}
          <time
            className="mt-[2px] block font-mono text-[11px] text-ink-4"
            dateTime={line.createdAt}
          >
            {when(line.createdAt)}
            {line.isReversal && " · anula un movimiento anterior"}
          </time>
        </span>
      </td>

      {/* Lo que entra pesa un poco más. Ni una gota de color. */}
      <td className={join(CELL, NUMBER_COLUMN, "text-[14px]", incoming && "font-medium")}>
        {formatSigned(line.amount)}
      </td>

      <td className={join(CELL, NUMBER_COLUMN, "text-[13px] text-ink-3")}>
        {formatUsd(line.balance)}
      </td>
    </tr>
  );
}

/** Cuenta sin movimientos. El saldo es $0.00, que no es lo mismo que vacío. */
function BlankStatement() {
  return (
    <EmptyState>
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
        {onlyDate(openedAt)} · {count} {count === 1 ? "asiento" : "asientos"}
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

const FULL = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const SHORT = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function when(iso: string): string {
  return FULL.format(new Date(iso));
}

function onlyDate(iso: string): string {
  return SHORT.format(new Date(iso));
}
