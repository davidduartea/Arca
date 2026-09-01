# syntax=docker/dockerfile:1

###############################################################################
# La API — NestJS + Prisma
#
# Tres etapas, y lo que importa es lo que **no** queda en la última: ni el
# código fuente, ni el compilador, ni las dependencias de desarrollo. Sólo el
# JavaScript ya construido y lo justo para ejecutarlo.
#
# Se construye desde la RAÍZ del monorepo, nunca desde esta carpeta:
#
#     docker build -f apps/api/Dockerfile .
#
# El contexto tiene que incluir el lockfile y el resto de manifiestos del
# espacio de trabajo, que viven fuera de `apps/api`.
###############################################################################

ARG NODE_VERSION=22-alpine


###############################################################################
# 1 · deps — instala dependencias
###############################################################################
FROM node:${NODE_VERSION} AS deps

# corepack trae la versión de pnpm que declara `packageManager`, en vez de la
# que llevara puesta la imagen base. Es lo que hace el build reproducible.
RUN corepack enable

WORKDIR /repo

# Sólo los manifiestos primero. Docker cachea capa a capa, y separar esto del
# código fuente significa que cambiar un `.ts` no vuelve a instalar nada.
#
# `pnpm-workspace.yaml` declara `apps/*`, así que el manifiesto de la web tiene
# que estar aunque no se construya aquí: sin él, el lockfile no cuadra y
# `--frozen-lockfile` aborta.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Sin `--ignore-scripts`, y es deliberado: la política de suministro ya vive en
# `pnpm-workspace.yaml`, donde los scripts de instalación están denegados por
# defecto y `@prisma/engines` es la única excepción declarada. Pasar la bandera
# aquí anularía esa lista entera — incluida la excepción — y el binario del
# motor de esquemas no se descargaría, así que el contenedor no podría migrar.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile


###############################################################################
# 2 · build — genera el cliente, compila y arma la carpeta de producción
###############################################################################
FROM deps AS build

WORKDIR /repo

COPY tsconfig.base.json ./
COPY apps/api ./apps/api

# `prisma generate` no se conecta a ninguna base, pero la configuración exige la
# URL nada más cargarse: `env()` de `prisma/config` lanza si falta la variable.
# Este valor es relleno y vive sólo en esta etapa, que no se despliega. La
# cadena de verdad la inyecta la plataforma al arrancar, y es la que usa
# `migrate deploy`.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

RUN pnpm --filter @arca/api exec prisma generate && \
    pnpm --filter @arca/api exec nest build

# `pnpm deploy` arma una carpeta autocontenida con SÓLO las dependencias de
# producción de este paquete y los enlaces del espacio de trabajo ya resueltos.
#
# Copiar el `node_modules` de la raíz en su lugar se lleva el store entero:
# Next, el compilador de TypeScript, SWC y Vitest viajarían dentro de la imagen
# del backend sin que nada los use.
#
# `--legacy` porque el modo nuevo exige `inject-workspace-packages`, que cambia
# cómo se resuelven los paquetes del espacio de trabajo en todo el repositorio.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    CI=true pnpm --filter @arca/api --prod --legacy deploy /out

# El cliente se genera **dentro del store**, así que `deploy` copia el paquete
# pero no lo que se generó en él. Hay que volver a generarlo contra la copia ya
# desplegada, y para eso necesita su esquema y su configuración al lado.
#
# Las migraciones viajan a propósito: son las que el contenedor aplica al
# arrancar.
COPY apps/api/prisma /out/prisma
COPY apps/api/prisma.config.ts /out/

# Se invoca el binario directamente en vez de con `pnpm exec`: lo que produce
# `deploy` ya no es un proyecto de pnpm —no tiene lockfile—, así que pnpm
# intentaría validar dependencias y abortaría.
RUN cd /out && ./node_modules/.bin/prisma generate


###############################################################################
# 3 · runner — la imagen que se despliega
###############################################################################
FROM node:${NODE_VERSION} AS runner

# El motor de esquemas de Prisma es un binario nativo enlazado contra OpenSSL, y
# la imagen de Alpine no lo trae. Sin esto `migrate deploy` muere al arrancar
# con un error de biblioteca compartida que no menciona a Prisma por ninguna
# parte.
RUN apk add --no-cache openssl

ENV NODE_ENV=production

WORKDIR /app

# Todo llega ya resuelto de `deploy`: `dist`, las dependencias de producción, el
# esquema, las migraciones y el cliente generado.
#
# Node trae un usuario `node` sin privilegios. Correr como root dentro del
# contenedor convierte una ejecución remota de código en control del contenedor.
#
# ## Lo que pesa esto, y por qué se acepta
#
# La imagen ronda los 770 MB y 400 son `node_modules`, casi todo la herramienta
# de línea de órdenes de Prisma con su árbol entero: Studio, un Postgres en WASM
# y una copia de TypeScript. Nada de eso participa en un `migrate deploy`, pero
# viene con el paquete y no hay una variante recortada.
#
# Está aquí porque el contenedor migra al arrancar, y eso lo hace desplegable de
# una pieza. Lo limpio sería un trabajo aparte que migre antes de levantar la
# aplicación, pero eso exige un orquestador que sepa encadenar los dos pasos y
# el plan gratuito de Render no lo da. Borrar a mano lo que sobra del árbol de
# Prisma no se hace: funcionaría hoy y se rompería en silencio en la próxima
# versión menor.
COPY --from=build --chown=node:node /out ./

COPY --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh

USER node

# Documental: quien manda es `PORT`, que inyecta la plataforma. Coincide con el
# valor por defecto del esquema de entorno.
EXPOSE 3000

# Sin `curl` ni `wget` en la imagen: se usa el propio Node, que ya está dentro.
#
# Contra `/healthz` y no `/readyz`, y ésa es toda la diferencia entre los dos:
# esto reinicia el contenedor cuando falla, y reiniciar no arregla una base
# caída. Sólo alarga el corte.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
