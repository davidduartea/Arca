import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // El origen de la API no lleva prefijo NEXT_PUBLIC: nunca debe acabar en el
  // paquete que se descarga el navegador. Todo lo que habla con ella corre en
  // el servidor, y el cliente sólo ve rutas de este mismo dominio.
  serverExternalPackages: [],

  /**
   * Las cabeceras que no dependen de la petición.
   *
   * La política de contenido **no está aquí**: lleva un nonce distinto en cada
   * petición, así que la pone `proxy.ts`, que es quien lo sortea.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },

          // Redundante con `frame-ancestors 'none'` de la política, y se queda:
          // los navegadores que no entienden la directiva sí entienden esto.
          { key: "X-Frame-Options", value: "DENY" },

          /*
            Dos años, subdominios incluidos.

            Sin esto, la primera visita de alguien que teclea el dominio a secas
            viaja en claro y se puede interceptar antes de que llegue la
            redirección a HTTPS. Con esto, el navegador se niega a usar http
            para este dominio durante los próximos dos años, aunque se lo pidan.

            `preload` es la lista que traen los navegadores de fábrica, y evita
            también esa primera visita. Pide un dominio propio y no se deshace
            en un día: entra cuando el despliegue tenga su dominio definitivo.
          */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },

          // Nada de esto se usa, así que nada de esto se concede — ni a la
          // aplicación ni a lo que alguien lograra colar dentro de ella.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default config;
