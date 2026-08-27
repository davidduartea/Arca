import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { wrapClass } from "@/styles/layout";

/** El marco de cualquier página: cabecera, contenido y pie. */
export function Shell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  return (
    // `min-h-[100dvh]` y no `100vh`: en el móvil, `vh` cuenta la barra del
    // navegador aunque esté tapando la pantalla, y el pie queda por debajo del
    // borde hasta que alguien hace scroll para nada.
    <div className="flex min-h-[100dvh] flex-col">
      <Header signedIn={signedIn} />
      <main className="flex-1 pt-s6 pb-[64px]">
        <div className={wrapClass}>{children}</div>
      </main>
      <Footer />
    </div>
  );
}
