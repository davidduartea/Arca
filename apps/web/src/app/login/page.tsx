import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Shell } from "@/components/Shell";
import { SignInScreen } from "@/modules/auth/main/SignInScreen";
import { currentUser, sessionEmail } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Acceder" };

interface Query {
  searchParams: Promise<{ expired?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: Query) {
  const { expired, next } = await searchParams;
  const target = next ?? "/accounts";

  // Quien ya tiene sesión no tiene nada que hacer aquí.
  if (await currentUser()) redirect(target);

  // El correo sólo se lee cuando hace falta enseñarlo: en el acceso normal no
  // se pregunta por él, y leer la cookie de todas formas sería trabajo para
  // nada en el camino más frecuente.
  const expiredSession = expired === "1";
  const email = expiredSession ? await sessionEmail() : null;

  return (
    <Shell signedIn={false}>
      <SignInScreen expired={expiredSession} email={email} next={target} />
    </Shell>
  );
}
