import Link from "next/link";

import { AuthMark } from "@/modules/auth/components/AuthMark";
import { ExpiredSession } from "@/modules/auth/components/ExpiredSession";
import { SignInForm } from "@/modules/auth/components/SignInForm";
import { altClass, pageClass } from "@/modules/auth/styles";

/**
 * Entrar.
 *
 * Dos formas, y la diferencia importa: **caducada no es lo mismo que nunca
 * entró**. A quien se le pasó la hora no se le pide el correo otra vez ni se le
 * saluda como a un desconocido; se le dice cuánto tiempo pasó y a dónde vuelve.
 *
 * La rama vive aquí y no en la ruta porque es una decisión de presentación: la
 * ruta ya hizo lo suyo —mirar la sesión y leer la consulta— y no tiene por qué
 * saber que existen dos pantallas de acceso.
 */
export function SignInScreen({
  expired,
  email,
  next,
}: {
  expired: boolean;
  email: string | null;
  next: string;
}) {
  if (expired) return <ExpiredSession email={email} next={next} />;

  return (
    <div className={pageClass}>
      <AuthMark />

      <SignInForm next={next} />

      <p className={altClass}>
        ¿No tienes cuenta? <Link href="/register">Abre una</Link>
      </p>
    </div>
  );
}
