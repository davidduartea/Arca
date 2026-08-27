import Link from "next/link";

import { AuthMark } from "@/modules/auth/components/AuthMark";
import { SignUpForm } from "@/modules/auth/components/SignUpForm";
import { altClass, pageClass } from "@/modules/auth/styles";

/** Abrir una cuenta: correo, contraseña y nada más. */
export function SignUpScreen() {
  return (
    <div className={pageClass}>
      <AuthMark />

      <SignUpForm />

      <p className={altClass}>
        ¿Ya tienes cuenta? <Link href="/login">Accede</Link>
      </p>
    </div>
  );
}
