"use client";

import { useEffect, useRef, useState } from "react";

import { copyableAccountNumber, formatAccountNumber } from "@/lib/account-number";
import { button } from "@/styles/button";

/** Cuánto se queda el cuño en lugar del botón. */
const COPIED_MS = 2_000;

/**
 * El número para recibir dinero.
 *
 * Es el dato que faltaba: la aplicación dejaba mandar dinero pero no recibirlo,
 * porque no había dónde encontrar el número que hay que darle a la otra parte.
 *
 * Va dentro del detalle de cuenta y no en una pantalla propia — recibir no es
 * una acción, es un dato de la cuenta. En el panel no aparece: tres números
 * seguidos no se distinguen entre sí.
 */
export function ReceiveBox({ number, accountName }: { number: string; accountName: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyableAccountNumber(number));
      setCopied(true);
      setFailed(false);
    } catch {
      // Sin permiso de portapapeles no hay nada que hacer desde aquí, pero
      // callarse sería peor: quien pulsa creería que se copió.
      setFailed(true);
    }
  }

  return (
    <div className="relative min-w-[250px] overflow-hidden border border-green bg-paper px-[16px] py-[12px] text-right">
      <img
        className="pointer-events-none absolute -top-[24px] -left-[38px] w-[130px] opacity-50"
        src="/art/rosette-watermark.svg"
        alt=""
      />

      <div className="relative">
        <p className="font-mono text-[9.5px] tracking-[0.16em] text-ink-4 uppercase">
          Para recibir dinero
        </p>

        <p className="mt-[5px] mb-[2px] font-mono text-[19px] tracking-[0.05em] tabular-nums">
          <span className="mr-[7px] text-[11px] tracking-[0.14em] text-ink-4">ARCA</span>
          {formatAccountNumber(number)}
        </p>

        {copied ? (
          // El cuño sustituye al botón, y el texto dice *qué* se copió.
          <p
            className="mt-s2 flex items-center justify-end gap-[6px] font-mono text-[10.5px] tracking-[0.1em] text-green uppercase"
            role="status"
          >
            <img src="/art/lozenge.svg" alt="" width={20} height={10} className="w-[18px]" />
            Copiado con el prefijo
          </p>
        ) : (
          <div className="mt-s2 flex justify-end gap-s2">
            <button
              className={button({ tone: "primary", size: "tiny" })}
              type="button"
              onClick={() => void copy()}
            >
              Copiar
            </button>
            <button
              className={button({ size: "tiny" })}
              type="button"
              onClick={() => {
                dialog.current?.showModal();
              }}
            >
              Ver en grande
            </button>
          </div>
        )}

        {failed && (
          <p className="mt-s2 text-[11.5px] leading-[1.5] text-ink-3" role="alert">
            El navegador no dejó copiar. Selecciónalo a mano.
          </p>
        )}
      </div>

      {/*
        `<dialog>` con `showModal()` y no un div flotante: trae de serie el
        atrapado del foco, el cierre con Escape y el fondo oscurecido. Hacerlo a
        mano es reimplementar tres cosas que el navegador ya hace bien.
      */}
      <dialog
        className="w-[calc(100%-32px)] max-w-[400px] border border-green bg-paper p-0 text-ink backdrop:bg-ink/55"
        ref={dialog}
      >
        {/* Ver en grande: para dictar, o para enseñar la pantalla. */}
        <div className="relative overflow-hidden px-[24px] pt-[28px] pb-[22px] text-center">
          <img
            className="pointer-events-none absolute top-0 left-0 h-[44px] w-[44px]"
            src="/art/corner.svg"
            alt=""
          />
          <img
            className="pointer-events-none absolute top-0 right-0 h-[44px] w-[44px] -scale-x-100"
            src="/art/corner.svg"
            alt=""
          />

          <div className="relative">
            <p className="font-mono text-[9px] tracking-[0.18em] text-ink-4 uppercase">
              {accountName}
            </p>
            <p className="mt-s2 mb-s1 font-mono text-[clamp(22px,6vw,28px)] tracking-[0.08em] tabular-nums">
              {formatAccountNumber(number)}
            </p>
            <p className="text-[11.5px] leading-[1.5] text-ink-3">
              Quien lo teclee verá este mismo nombre antes de confirmar.
            </p>

            <button
              className={button({ className: "mt-s4" })}
              type="button"
              onClick={() => {
                dialog.current?.close();
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
