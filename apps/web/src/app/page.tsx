import { Shell } from "@/components/Shell";
import { currentUser } from "@/modules/auth/queries";
import { HomeScreen } from "@/modules/home/main/HomeScreen";

/**
 * La ruta resuelve quién mira y no hace nada más.
 *
 * La sesión decide dos cosas —la cabecera y el texto del botón principal—, así
 * que se lee una vez aquí y baja como un booleano. La pantalla no vuelve a
 * preguntar: así se puede montar en un test sin servidor detrás.
 */
export default async function HomePage() {
  const signedIn = (await currentUser()) !== null;

  return (
    <Shell signedIn={signedIn}>
      <HomeScreen signedIn={signedIn} />
    </Shell>
  );
}
