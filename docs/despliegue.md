# Despliegue

Tres servicios, tres cuentas, cero euros:

|               | Dónde        | Por qué ahí                                          |
| ------------- | ------------ | ---------------------------------------------------- |
| Web (Next.js) | **Vercel**   | Renderizado en servidor, que es lo que hace la web   |
| API (NestJS)  | **Render**   | Un proceso de verdad, construido desde el Dockerfile |
| Postgres      | **Supabase** | Postgres gestionado, plan gratuito sin fecha de fin  |

---

## Por qué este reparto

**La API no puede vivir en Vercel.** Las funciones son efímeras y no tienen un
proceso al que agarrarse; aquí eso rompe dos cosas concretas. El limitador de
intentos cuenta en memoria, así que cada invocación estrenaría cupo y el límite
del acceso dejaría de existir. Y las transferencias bloquean filas dentro de una
transacción: sin un pool de conexiones estable, cada llamada abre la suya y una
base gratuita se queda sin conexiones antes que sin CPU.

**El Postgres gratuito de Render caduca a los 90 días.** Por eso la base va en
Supabase y no ahí, que sería lo cómodo.

**Neon** es la alternativa directa para la base y aguanta mejor la inactividad:
suspende sólo el cómputo y despierta sola en milisegundos, en vez de pausar el
proyecto entero. Si Supabase molesta, el cambio es mecánico — mismas tres URLs
y los mismos dos roles.

---

## El precio de que sea gratis

Dos cosas duermen, y por motivos distintos:

|              | Cuándo                    | Cuánto tarda en volver                      |
| ------------ | ------------------------- | ------------------------------------------- |
| **Render**   | 15 minutos sin peticiones | cerca de un minuto                          |
| **Supabase** | una semana sin actividad  | no vuelve solo — hay que restaurarlo a mano |

Para un enlace que vive en un CV las dos importan. Quien lo abre y ve una
pantalla en blanco durante un minuto no siempre espera; y si además Supabase
pausó el proyecto, no funciona en absoluto.

### Mantenerlos despiertos

Un cron gratuito en GitHub Actions cada diez minutos resuelve las dos, y está en
[`.github/workflows/keep-alive.yml`](../.github/workflows/keep-alive.yml).

Llama a **`/readyz`, no a `/healthz`**, y ahí está todo el asunto: la
comprobación de vida está hecha a propósito para **no** tocar la base, así que
despertaría a Render y dejaría que Supabase se durmiera igual. `/readyz` sí
consulta, es público y no modifica nada.

Sólo hay que darle la URL. **Settings** → **Secrets and variables** →
**Actions** → **Variables** → **New repository variable**:

| Nombre              | Valor                                     |
| ------------------- | ----------------------------------------- |
| `API_KEEPALIVE_URL` | `https://TU-SERVICIO.onrender.com/readyz` |

Va como _variable_ y no como _secret_: es una URL pública, y así se lee en el
registro de la ejecución cuando algo falla.

**No sale gratis del todo:** mantener el servicio despierto consume horas del
plan de Render, que da 750 al mes. Sobran para un servicio siempre encendido, no
para dos.

---

## 1 · Supabase — la base

1. **supabase.com** → **New Project**. Guarda la contraseña que pide: se enseña
   una sola vez y va dentro de las cadenas de conexión.
2. Elige la región y **apúntala**. El servicio de Render tiene que ir en la
   misma: cada consulta cruza esa distancia, y una transferencia hace varias
   dentro de la misma transacción con la cuenta bloqueada mientras tanto.
   `render.yaml` está en `ohio`, que es el `us-east-2` de Supabase.
3. **Project Settings** → **Database** → **Connection string**. Salen **tres** y
   la diferencia importa:

| Cadena                 | Puerto | Para qué                                                |
| ---------------------- | ------ | ------------------------------------------------------- |
| **Transaction pooler** | `6543` | `DATABASE_URL` y `READER_DATABASE_URL` — las peticiones |
| **Session pooler**     | `5432` | `DIRECT_URL` — las migraciones de Prisma                |
| **Direct connection**  | `5432` | **no la uses aquí** — sólo IPv6, más abajo              |

Son tres variables y no dos porque la aplicación entra con **dos usuarios
distintos**, uno para mover dinero y otro para servir extractos. Eso va más
abajo, en «Los dos usuarios de la aplicación»; aquí lo que importa es el puerto.

### Por qué el puerto importa

El pooler en modo transacción reparte una misma conexión entre muchas
peticiones, y por eso **no admite las sentencias DDL** que usa
`prisma migrate deploy` — `CREATE TABLE`, `ALTER TABLE`. Y este contenedor migra
al arrancar, así que con una sola URL no levantaría.

**Es el fallo más común de este montaje**: poner la del pooler de transacciones
en las tres variables. Arranca, consulta bien, y muere el día que hay una
migración pendiente.

Quién lee cada una está en el código, y son tres sitios distintos:

- `prisma.config.ts` resuelve `DIRECT_URL ?? DATABASE_URL`, y es lo único que
  mira la herramienta de línea de órdenes — `migrate`, `studio`, `db pull`.
- `PrismaService` construye su cliente con `DATABASE_URL`, y `ReaderService` el
  suyo con `READER_DATABASE_URL`, los dos con un adaptador de driver. Quien
  atiende peticiones no pasa por la configuración de Prisma.

### La conexión directa NO funciona en Render

No es un «por si acaso». **Render no tiene salida IPv6** y la conexión directa
de Supabase — `db.REF.supabase.co` — resuelve **sólo a IPv6**. La migración
falla con «Network is unreachable», que parece un error de credenciales y no lo
es. El IPv4 dedicado es un extra de pago.

Así que `DIRECT_URL` va con el **session pooler**:

|                                        | Host                     | Puerto |
| -------------------------------------- | ------------------------ | ------ |
| `DATABASE_URL` y `READER_DATABASE_URL` | `...pooler.supabase.com` | `6543` |
| `DIRECT_URL`                           | `...pooler.supabase.com` | `5432` |

Mismo host, distinto puerto. El de 5432 mantiene la conexión durante toda la
sesión, así que admite el DDL de las migraciones — y llega por IPv4.

### Aquí NO hace falta `?pgbouncer=true`

Es la diferencia con cualquier guía de Prisma que encuentres, y conviene
entenderla antes de copiar el parámetro por costumbre.

Ese parámetro existe para apagar las sentencias preparadas del motor de
consultas de Prisma, que el pooler en modo transacción no mantiene entre
peticiones — de ahí los errores intermitentes de «prepared statement already
exists». **Prisma 7 con adaptador de driver ya no tiene ese motor**: quien
ejecuta es `pg`, y el adaptador sólo pone nombre a una sentencia si se le
configura un `statementNameGenerator`. Aquí no se le configura, así que todas
las consultas van sin nombre y el pooler no tiene nada que recordar entre una y
otra.

Ponerlo no rompe nada — `pg` ignora los parámetros que no conoce — pero es un
adorno que hace pensar que protege de algo.

### SSL

`pg` **no cifra si no se lo pides**: sin `sslmode` en la cadena, la conexión va
en claro. Con la base en otro proveedor, eso son las credenciales y los saldos
viajando por Internet sin sobre.

Añade `?sslmode=verify-full` a las tres URLs. Verifica la cadena del certificado
y el nombre del servidor, que es lo que hace falta para que el cifrado sirva de
algo contra un intermediario y no sólo contra un curioso.

Un aviso sobre `sslmode=require`, porque no significa lo que parece: desde
`pg-connection-string` 2.14 se trata como un alias de `verify-full` y avisa por
consola de que está en desuso. Si lo que se quiere es la semántica de libpq
—ciframos pero no verificamos— hay que pedirla entera:
`?sslmode=require&uselibpqcompat=true`. Sirve como último recurso si el
certificado del pooler no valida contra las autoridades que trae Node, y lo que
se pierde es la protección contra un intermediario. No lo dejes puesto sin saber
por qué está.

### Lo que Supabase se lleva por delante

Pausa el proyecto **entero** tras una semana sin actividad, y hay que
restaurarlo a mano desde el panel. No es sólo la base. Cualquier consulta
reinicia la cuenta atrás, y de eso se encarga el cron de más arriba.

### Los dos usuarios de la aplicación

Falta un paso que no está en ninguna migración, y **sin él la API no arranca**.

La migración `dos_roles_y_rls` crea `arca_reader` y `arca_ledger`: dos roles de
grupo que llevan los permisos y **no pueden conectarse**. Quien se conecta es un
usuario con contraseña, y una contraseña no puede vivir en un archivo
versionado. Así que se crean aquí, una vez, desde el **SQL Editor** de Supabase:

```sql
CREATE USER arca_ledger_app WITH PASSWORD 'una-contraseña-larga-y-aleatoria';
GRANT arca_ledger TO arca_ledger_app;

CREATE USER arca_reader_app WITH PASSWORD 'otra-distinta-igual-de-larga';
GRANT arca_reader TO arca_reader_app;
```

Para las contraseñas, lo mismo que para el secreto de firma:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

**Cada usuario en un rol y sólo en uno.** Las políticas permisivas se suman: uno
que fuera miembro de los dos tendría la del libro —que lo enseña todo— por
encima de la del lector, y la frontera desaparecería sin que nada avisara.

Después, las tres cadenas de conexión de Supabase son la misma con distinto
usuario dentro:

| Variable              | Usuario           | Puerto | Para qué                        |
| --------------------- | ----------------- | ------ | ------------------------------- |
| `DATABASE_URL`        | `arca_ledger_app` | `6543` | mover dinero, acceso, auditoría |
| `READER_DATABASE_URL` | `arca_reader_app` | `6543` | extractos, saldos, tus cuentas  |
| `DIRECT_URL`          | `postgres`        | `5432` | **sólo** migrar, al arrancar    |

Ojo con el usuario del pooler de Supabase, que lleva la referencia del proyecto
pegada: donde pone `postgres.abcdefgh` hay que escribir `arca_ledger_app.abcdefgh`.

### Por qué tres y no una

Porque son tres autoridades distintas, y la del medio es la que evita el fallo
más caro que puede tener un libro contable: **enseñarle a alguien el dinero de
otro**.

`arca_reader` tiene `SELECT` y nada más, y sus políticas por fila comparan con
el `arca.user_id` que la aplicación anuncia dentro de cada transacción. Una
consulta a la que se le olvide el `where` por dueño no devuelve el libro entero:
devuelve lo de quien pregunta. Y una que se olvide de anunciar quién pregunta no
devuelve nada — la comparación es contra nulo, que es falsa para toda fila.

`arca_ledger` **no** está sujeto a esa política, y tampoco es un descuido. Mover
dinero cruza la propiedad por diseño: una transferencia bloquea la cuenta del
destinatario y le escribe un asiento. Con una política por dueño encima, el
`SELECT ... FOR UPDATE` sobre las dos cuentas devuelve una sola fila **sin dar
error**, y la comprobación de fondos de una anulación lee cero donde hay 9.500.
Los dos fallan callando, que en el camino del dinero es lo peor que puede pasar.
Su límite son los privilegios: sin `UPDATE` ni `DELETE` sobre `entries` y
`transactions`, sin `TRUNCATE`, y sin ser dueño de las tablas, así que tampoco
puede quitar los triggers que garantizan que los asientos sumen cero.

`DIRECT_URL` es la dueña del esquema y sólo la usa `prisma migrate deploy` al
arrancar el contenedor. Ninguno de los otros dos puede aplicar una migración, y
es deliberado: quien atiende peticiones no debe poder cambiar la forma de la
base ni quitarle sus garantías.

---

## 2 · Render — la API

Hay un [`render.yaml`](../render.yaml) en la raíz que lo describe todo, así que
no hace falta rellenar el formulario a mano.

1. **render.com** → cuenta con GitHub. El plan gratuito no pide tarjeta.
2. **New** → **Blueprint** → el repositorio.
3. Render lee `render.yaml` y propone el servicio. Sólo pregunta por las
   variables marcadas como secretas.

Lo que dice ese archivo, y lo único que hay que entender de él:

```yaml
dockerfilePath: ./apps/api/Dockerfile
dockerContext: . # ← la raíz, no apps/api
healthCheckPath: /healthz
```

**El contexto es la raíz del repositorio.** El Dockerfile vive en `apps/api`
pero necesita el lockfile y los manifiestos del espacio de trabajo, que quedan
fuera de esa carpeta. Apuntar el contexto a `apps/api` es el fallo que hace que
la construcción muera buscando archivos que no ve.

Si prefieres crearlo a mano (**New** → **Web Service**), esos tres valores son
los que hay que poner.

### Variables

| Variable              | Valor                                                     |
| --------------------- | --------------------------------------------------------- |
| `NODE_ENV`            | `production` — ya viene en el blueprint                   |
| `TRUST_PROXY_HOPS`    | `1` — ya viene en el blueprint                            |
| `DATABASE_URL`        | pooler de transacciones (6543), usuario `arca_ledger_app` |
| `READER_DATABASE_URL` | pooler de transacciones (6543), usuario `arca_reader_app` |
| `DIRECT_URL`          | **session pooler** (5432), usuario `postgres` — la dueña  |
| `JWT_SECRET`          | 32 caracteres aleatorios como mínimo                      |

Las tres cadenas con `sslmode`, y las tres con usuario distinto. Los dos de la
aplicación se crean a mano una vez; ver «Los dos usuarios de la aplicación» más
arriba.

`READER_DATABASE_URL` **no tiene respaldo**: si falta, la API no arranca. Caer
sobre `DATABASE_URL` daría un servicio que responde igual y ha perdido la
frontera entre leer lo tuyo y ver el libro entero, sin decírselo a nadie.

Para el secreto:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

`PORT` no se pone: lo inyecta Render y el esquema de entorno lo lee.

`TRUST_PROXY_HOPS` vale **1**, que es el balanceador de Render, y de ese número
depende que el limitador cuente a quien llama. A cero, todo el mundo comparte la
IP del proxy y se limitan unos a otros. De más, cualquiera falsifica la suya con
una cabecera `X-Forwarded-For` y se salta el límite del acceso, que es
precisamente la puerta que se prueba a ciegas.

### Comprobación

```bash
curl https://TU-SERVICIO.onrender.com/healthz   # ¿vive el proceso?
curl https://TU-SERVICIO.onrender.com/readyz    # ¿y contesta la base?
```

Las migraciones se aplican solas al arrancar. Si una falla, el contenedor no
levanta: es deliberado, porque una API hablando con un esquema que no le
corresponde falla de formas mucho más difíciles de diagnosticar.

Ésa es también la razón de que `prisma` esté en `dependencies` y no en
`devDependencies`, que a primera vista parece un error: si el contenedor migra
al arrancar, la herramienta hace falta en tiempo de ejecución y no sólo al
construir. `pnpm deploy --prod` deja fuera las de desarrollo, así que declararla
donde estaba producía una imagen sin nada con lo que migrar.

---

## 3 · Vercel — la web

| Ajuste             | Valor                              |
| ------------------ | ---------------------------------- |
| **Root Directory** | `apps/web`                         |
| Build Command      | _por defecto_ (`next build`)       |
| `API_URL`          | `https://TU-SERVICIO.onrender.com` |

`API_URL` **sin prefijo `NEXT_PUBLIC` y sin barra final**. Lo primero es la
decisión de seguridad de todo el frontal: con ese prefijo, el origen del backend
se incrusta en el paquete que se descarga el navegador. Sin él sólo existe en el
servidor, y lo único que ve el cliente son rutas de su propio dominio.

Hace falta al construir y al ejecutar con el mismo valor: `api-url.ts` la lee al
cargarse, así que si falta, el build muere ahí mismo en vez de arrancar y
apuntar a `localhost` sin avisar.

El comando de construcción se deja por defecto. Aquí no hay paquete compartido
que compilar antes, así que `next build` a secas es exactamente lo que hay que
correr.

### No hay paso 4

En el despliegue de un chat aquí iría «vuelve al backend y ponle el origen de la
web», porque el navegador habla con las dos partes y CORS tiene que dejarle.
**Aquí no existe ese paso, y es una propiedad del diseño, no un olvido:** del
navegador no sale ni una petición hacia la API. Todo pasa por acciones de
servidor de Next, así que quien llama siempre es otro servidor. La API no tiene
CORS configurado porque no lo necesita, y la política de contenido de la web
lleva `connect-src 'self'` — aunque alguien lograra inyectar un script, no
tendría a dónde mandar nada.

---

## Lo que queda pendiente

**Redis para el limitador.** El contador vive en la memoria del proceso: con dos
instancias son dos cupos. Mientras el plan gratuito dé una sola instancia no se
nota, y el día que haya dos deja de ser un límite.

Lo otro que estaba en esta lista era RLS, y ya está hecho — pero no como se
había planeado. La idea era una política por dueño sobre un único rol, y eso
**rompe el camino del dinero en silencio**: mover dinero cruza la propiedad por
diseño. Lo que hay en su lugar son dos roles, y el porqué está más arriba, en
«Por qué tres y no una». La migración es `dos_roles_y_rls` y los tests que la
sujetan, `src/prisma/roles.spec.ts`.

---

## Si algo falla

| Síntoma                                        | Causa                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Error de DDL al migrar                         | `DIRECT_URL` apunta al pooler de transacciones (6543). Va al de sesión (5432)  |
| «Network is unreachable» al migrar             | Pusiste la conexión directa. Render no tiene IPv6: usa el session pooler       |
| El contenedor no arranca                       | Los registros nombran la variable que falta: el entorno se valida al arrancar  |
| `password authentication failed`               | Falta crear los usuarios `arca_ledger_app` y `arca_reader_app` en Supabase     |
| Todo devuelve 404 o listas vacías              | El usuario de `READER_DATABASE_URL` no es miembro de `arca_reader`             |
| El lector ve el libro entero                   | Ese usuario es miembro de LOS DOS roles. Cada uno en uno solo                  |
| `self-signed certificate in certificate chain` | El certificado del pooler no valida. Ver el apartado de SSL                    |
| El build de Vercel muere nada más empezar      | Falta `API_URL`. Se lee al cargar, no en la primera petición                   |
| `/healthz` bien y `/readyz` con 503            | La API vive y la base no contesta. Mira si Supabase pausó el proyecto          |
| Todo dejó de responder de golpe                | Supabase pausó el proyecto por inactividad. Restaurar desde el panel           |
| La primera visita tarda un minuto              | Render estaba dormido. Es el precio del plan gratuito                          |
| 429 en todo desde una misma red                | `TRUST_PROXY_HOPS` a 0 detrás del balanceador: todos comparten la IP del proxy |
