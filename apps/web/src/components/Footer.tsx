import { wrapClass } from "@/styles/layout";

export function Footer() {
  return (
    <footer className="mt-auto bg-green">
      <img className="h-[13px] w-full opacity-[0.38]" src="/art/band-light.svg" alt="" />

      <div className={wrapClass}>
        <div className="flex flex-wrap items-center justify-between gap-s4 pt-[15px] pb-[17px] text-[12px] text-paper/70">
          <span className="font-serif text-[14px] tracking-[0.18em] text-paper uppercase">
            Arca
          </span>
          <span>Todo en dólares · un solo libro · ninguna notificación</span>
        </div>
      </div>
    </footer>
  );
}
