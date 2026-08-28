import { ChangePasswordForm } from "@/modules/auth/components/ChangePasswordForm";
import { CloseSessions } from "@/modules/auth/components/CloseSessions";
import { eyebrowClass } from "@/styles/layout";

/**
 * «Tu cuenta»: dos cosas y ninguna más.
 *
 * No es un perfil. De quien entra sólo se sabe el correo — no hay nombre para
 * mostrar, ni foto, ni preferencias— y la pantalla lo dice en voz alta en vez
 * de disimularlo con cajas vacías. Si parece corta, es que está terminada.
 *
 * Va sin ornamento a propósito: la banda y la viñeta son de las pantallas que
 * se visitan a diario, y ésta se visita dos veces en la vida.
 */
export function AccountScreen({ email }: { email: string }) {
  return (
    <>
      <h1 className="text-[27px]">Tu cuenta</h1>
      <p className="mt-s2 max-w-[560px] text-ink-2">
        Entras con <span className="text-ink">{email}</span>. Es lo único que sabemos de ti.
      </p>

      <Section title="Cambiar la contraseña">
        <ChangePasswordForm />
      </Section>

      <Section title="Salir en todos los sitios">
        <p className="mt-s3 max-w-[560px] text-ink-2">
          Si crees que alguien más ha entrado en tu cuenta, esto cierra todas las sesiones
          abiertas, la tuya incluida. Tendrás que volver a entrar.
        </p>
        <CloseSessions />
      </Section>
    </>
  );
}

/**
 * Una sección, separada por el filete grueso.
 *
 * El título es un `h2` de verdad aunque se vea como una etiqueta pequeña: es lo
 * que deja saltar de una sección a otra a quien navega por titulares, y aquí
 * las dos secciones son las dos únicas cosas de la página.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-s5 border-t-[1.5px] border-t-rule pt-s4">
      <h2 className={`${eyebrowClass} text-ink-3`}>{title}</h2>
      {children}
    </section>
  );
}
