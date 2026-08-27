import Link from "next/link";

import { Certificate } from "@/modules/home/components/Certificate";
import { Idea } from "@/modules/home/components/Idea";
import { button } from "@/styles/button";
import { eyebrowClass } from "@/styles/layout";

/**
 * La portada.
 *
 * Tiene que explicarle Arca a alguien que llega sin contexto, y lo hace con la
 * misma frase que gobierna el proyecto entero. Sin partida doble, sin gráficos
 * y sin prometer que te ayudará a ahorrar.
 */
export function HomeScreen({ signedIn }: { signedIn: boolean }) {
  return (
    // Una columna hasta 860 px; a partir de ahí, el texto y el certificado.
    <div className="grid grid-cols-1 items-start gap-s6 min-[861px]:grid-cols-[1.05fr_0.95fr]">
      <div>
        <p className={`${eyebrowClass} text-green-light`}>
          Libro contable personal · partida doble
        </p>

        <h1 className="mt-s3 mb-s4 text-[clamp(34px,6vw,50px)] leading-[1.06]">
          El saldo no se guarda
          <br />
          en ninguna parte.
          <br />
          Se deriva.
        </h1>

        <p className="max-w-[46ch] text-[15px] leading-[1.65] text-ink-2">
          Cada movimiento queda escrito para siempre y lleva anotado cuánto había justo después
          de él. Nada se edita, nada se borra: un error se corrige con un asiento que lo anula,
          y los dos siguen en el extracto.
        </p>

        <div className="mt-s5 flex flex-wrap gap-s3">
          <Link
            className={button({ tone: "primary" })}
            href={signedIn ? "/accounts" : "/register"}
          >
            {signedIn ? "Ir a mis cuentas" : "Abrir una cuenta"}
          </Link>
          {!signedIn && (
            <Link className={button()} href="/login">
              Ya tengo cuenta
            </Link>
          )}
        </div>

        <img className="mt-[30px] mb-s4 w-full" src="/art/rule.svg" alt="" />

        <div className="grid grid-cols-1 gap-s4 min-[561px]:grid-cols-3">
          <Idea title="Se deriva">
            El saldo es la suma de los movimientos, calculada al leerla.
          </Idea>
          <Idea title="Nada se borra">
            Los asientos son inmutables. Se anulan, no se corrigen.
          </Idea>
          <Idea title="Deja rastro">
            Cada línea guarda el saldo de ese instante. El extracto es una historia.
          </Idea>
        </div>
      </div>

      <Certificate />
    </div>
  );
}
