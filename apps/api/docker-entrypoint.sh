#!/bin/sh
set -e

# Lleva la base al día antes de aceptar tráfico.
#
# `migrate deploy` sólo aplica migraciones que ya existen — nunca inventa ni
# borra nada, a diferencia de `migrate dev`. Es la orden pensada para
# producción.
#
# Prisma toma un cerrojo consultivo de Postgres mientras migra, así que varias
# réplicas arrancando a la vez no se pisan: la primera migra, las demás esperan
# y siguen.
#
# Si una migración falla, el contenedor no arranca. Es deliberado: una API
# hablando con un esquema que no le corresponde falla de formas mucho más
# difíciles de diagnosticar que un contenedor que no levanta.
echo "Aplicando migraciones pendientes..."
./node_modules/.bin/prisma migrate deploy

echo "Arrancando la API..."
exec node dist/main.js
