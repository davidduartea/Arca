/**
 * Lo que se ve mientras el servidor busca.
 *
 * Next lo enseña en cuanto empieza la navegación, sin esperar a los datos. Sin
 * él, al pulsar un enlace no pasa nada visible hasta que la página entera está
 * lista, y eso se siente como si la aplicación se hubiera colgado.
 *
 * Es la silueta de la página que viene, no una rueda girando: quien espera ve
 * dónde van a caer las cosas. Y no aparece antes de 300 ms — el retardo vive en
 * `--animate-reveal`, no en un temporizador de JavaScript.
 */
export default function Loading() {
  return (
    <div aria-live="polite" aria-busy="true">
      <span className="sr-only">Abriendo la cuenta…</span>

      <div className="grid max-w-[620px] animate-reveal gap-s3 opacity-0">
        <Bar className="h-[11px] w-[44%]" />
        <Bar className="h-[30px] w-[66%]" />

        <img className="w-full opacity-30" src="/art/rule.svg" alt="" />

        <Bar className="h-[9px] w-full" />
        <Bar className="h-[9px] w-[84%]" />
        <Bar className="h-[9px] w-[92%]" />
        <Bar className="h-[9px] w-[78%]" />

        <p className="mt-s3 text-center font-mono text-[10px] tracking-[0.14em] text-ink-4 uppercase">
          Abriendo la cuenta
        </p>
      </div>
    </div>
  );
}

/** Una raya de tinta al 11 %. No late: esto es papel, no una pantalla de televisión. */
function Bar({ className }: { className: string }) {
  return <div className={`bg-green/11 ${className}`} />;
}
