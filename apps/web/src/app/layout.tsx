import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

/**
 * Las tres letras del sistema, servidas desde este mismo dominio.
 *
 * `next/font` las descarga en el build y las sirve él: ni una petición a Google
 * en tiempo de ejecución, ni la dirección IP de quien entra viajando a un
 * tercero. De paso desaparece el salto de texto al cargar, porque el navegador
 * ya sabe cuánto ocupa la letra antes de tenerla.
 *
 * Se publican como `--face-*` y no como `--font-*` porque lo segundo es el
 * espacio de nombres de Tailwind: los dos escribirían en la misma variable del
 * `<html>` y ganaría el último. `globals.css` compone la pila completa a partir
 * de éstas.
 */
const serif = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--face-serif",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--face-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--face-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Arca", template: "%s · Arca" },
  description:
    "Un libro contable personal por partida doble. El saldo no se guarda en ninguna parte: se deriva sumando los movimientos.",
  icons: {
    icon: [
      { url: "/art/icon-16.svg", sizes: "16x16", type: "image/svg+xml" },
      { url: "/art/icon-32.svg", sizes: "32x32", type: "image/svg+xml" },
    ],
    apple: { url: "/art/icon-180.svg", sizes: "180x180", type: "image/svg+xml" },
  },
};

export const viewport: Viewport = {
  themeColor: "#1F4634",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
