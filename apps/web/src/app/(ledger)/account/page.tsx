import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountScreen } from "@/modules/auth/main/AccountScreen";
import { currentUser } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Tu cuenta" };

/**
 * El `redirect` es redundante con el guardia del layout, y se queda.
 *
 * Sin él, TypeScript no sabría que hay correo que enseñar y habría que
 * inventarse un valor de relleno para un caso que no puede ocurrir. Prefiero
 * comprobarlo dos veces que escribir un `?? ""` que nadie va a ver nunca.
 */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return <AccountScreen email={user.email} name={user.name} />;
}
