import { redirect } from "next/navigation";

import { Shell } from "@/components/Shell";
import { currentUser } from "@/modules/auth/queries";

/**
 * El guardia del libro.
 *
 * Todo lo que cuelga de aquí exige sesión, y la comprobación vive en el layout
 * y no en cada página: así, el día que alguien añada una pantalla nueva bajo
 * este grupo, queda protegida sin acordarse de nada. Olvidarse cierra en vez de
 * abrir.
 */
export default async function LedgerLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUser())) redirect("/login");

  return <Shell signedIn>{children}</Shell>;
}
