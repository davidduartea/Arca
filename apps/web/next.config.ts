import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // El origen de la API no lleva prefijo NEXT_PUBLIC: nunca debe acabar en el
  // paquete que se descarga el navegador. Todo lo que habla con ella corre en
  // el servidor, y el cliente sólo ve rutas de este mismo dominio.
  serverExternalPackages: [],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
