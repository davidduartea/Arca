"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { text } from "@/lib/form";
import { clearSession, writeSession } from "@/lib/session";
import { firstMessage, issuesByField } from "@/lib/validation";
import {
  credentialsSchema,
  nameChangeSchema,
  registrationSchema,
} from "@/models/auth/Credentials";
import type { FormState } from "@/models/auth/FormState";
import { passwordChangeSchema } from "@/models/auth/PasswordChange";
import type { Session } from "@/models/auth/Session";
import type { User } from "@/models/auth/User";

/**
 * Todo lo que toca la sesión, en el servidor.
 *
 * `"use server"` no es una etiqueta decorativa: marca la frontera. Nada de este
 * archivo llega al navegador, así que el token del backend nunca sale de la
 * cookie y el origen de la API no aparece en el paquete que se descarga nadie.
 *
 * Next compara además `Origin` con `Host` en cada llamada a una server action,
 * que es protección contra CSRF sin escribir una línea.
 */

export async function signIn(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse(readCredentials(form));

  // Un solo mensaje y sin campo marcado, igual que cuando la API rechaza: aquí
  // sólo se comprueba la forma, pero señalar el campo del correo empezaría a
  // dibujar la diferencia entre «está mal escrito» y «no existe».
  if (!parsed.success) return { error: firstMessage(parsed.error) };

  try {
    const session = await api<Session>("/auth/login", {
      method: "POST",
      body: parsed.data,
      anonymous: true,
    });

    await writeSession(session.token, session.expiresInSeconds);
  } catch (error) {
    return toFormState(error);
  }

  // Fuera del `try`: `redirect` funciona lanzando, y dentro lo atraparía el
  // `catch` y lo enseñaría como si fuera un fallo del acceso.
  redirect(safeReturn(text(form, "next")));
}

export async function signUp(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = registrationSchema.safeParse({
    ...readCredentials(form),
    name: text(form, "name"),
  });

  // Al registrarse sí se marca el campo: no hay ninguna cuenta de la que hablar
  // todavía, y quien está creando una necesita saber cuál de los dos arreglar.
  if (!parsed.success) {
    return { error: "Revisa los datos.", issues: issuesByField(parsed.error) };
  }

  try {
    const session = await api<Session>("/auth/register", {
      method: "POST",
      body: parsed.data,
      anonymous: true,
    });

    await writeSession(session.token, session.expiresInSeconds);
  } catch (error) {
    return toFormState(error);
  }

  redirect("/accounts");
}

export async function signOut(): Promise<void> {
  await clearSession();

  redirect("/");
}

/**
 * Cambiar la contraseña.
 *
 * La API cierra **todas** las sesiones al hacerlo, la de aquí incluida: si
 * alguien había entrado con la anterior, dejarle el token vivo convertiría el
 * cambio en un gesto. Por eso devuelve una sesión nueva y hay que guardarla —
 * sin eso, quien cuida de su cuenta saldría despedido de su propia pantalla.
 */
export async function changePassword(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: text(form, "currentPassword"),
    newPassword: text(form, "newPassword"),
  });

  if (!parsed.success) {
    return { error: "Revisa los datos.", issues: issuesByField(parsed.error) };
  }

  try {
    const session = await api<Session>("/auth/password", {
      method: "PATCH",
      body: parsed.data,
    });

    await writeSession(session.token, session.expiresInSeconds);
  } catch (error) {
    return toPasswordFormState(error);
  }

  return { ok: true };
}

/**
 * Cambiar el nombre.
 *
 * No devuelve sesión nueva y no hace falta: el nombre no va firmado dentro del
 * token, la API lo relee en cada petición. Lo que sí hay que hacer es invalidar
 * las rutas que lo pintan — la barra lo enseña en todas.
 */
export async function changeName(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = nameChangeSchema.safeParse({ name: text(form, "name") });

  if (!parsed.success) {
    return { error: "Revisa los datos.", issues: issuesByField(parsed.error) };
  }

  try {
    await api<{ user: User }>("/auth/name", { method: "PATCH", body: parsed.data });
  } catch (error) {
    if (!(error instanceof ApiError)) return { error: OFFLINE };

    return commonFailure(error);
  }

  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Cerrar todas las sesiones, la de aquí incluida.
 *
 * Se borra la cookie además de invalidar el token en la API. Sin eso quedaría
 * en el navegador una cookie que ya no abre nada, y el proxy dejaría pasar a
 * `/accounts` para que el guardia del layout rebotara a quien entrara: dos
 * viajes para acabar en el mismo sitio.
 */
export async function closeAllSessions(): Promise<void> {
  await api("/auth/logout-all", { method: "POST" });
  await clearSession();

  redirect("/login");
}

/**
 * A donde volver despues de entrar.
 *
 * Solo rutas de esta misma aplicacion. Aceptar una URL completa convertiria el
 * acceso en un redirector abierto: bastaria con mandarle a alguien un enlace a
 * `/login?next=https://otro-sitio` para sacarlo fuera desde un dominio en el
 * que confia, y con la sesion recien abierta.
 *
 * Las que empiezan por dos barras tambien salen fuera — `//otro-sitio` es una
 * URL relativa al protocolo.
 */
function safeReturn(target: string): string {
  if (!target.startsWith("/") || target.startsWith("//")) return "/accounts";

  return target;
}

function readCredentials(form: FormData): { email: string; password: string } {
  return {
    email: text(form, "email"),
    password: text(form, "password"),
  };
}

/**
 * Convierte el fallo de la API en algo que el formulario pueda enseñar.
 *
 * El 401 se reescribe a un único mensaje sin campo asociado. La API ya da el
 * mismo texto tanto si el correo no existe como si la contraseña no es esa —
 * distinguirlos diría a quien lo prueba qué correos están registrados — y aquí
 * se respeta esa decisión no marcando ningún campo en rojo.
 */
function toFormState(error: unknown): FormState {
  if (!(error instanceof ApiError)) return { error: OFFLINE };

  if (error.status === 401) return { error: "El correo o la contraseña no son correctos." };

  return commonFailure(error);
}

/**
 * Lo mismo, para el cambio de contraseña, donde 401 y 403 no significan lo
 * mismo que al entrar.
 *
 * El 403 es «esa no es tu contraseña actual» y el 401 es «tu sesión ya no
 * vale». La API los separa a propósito: si equivocarse escribiendo la actual
 * devolviera 401, el cliente daría la sesión por perdida y echaría a alguien
 * que sólo ha tecleado mal.
 */
function toPasswordFormState(error: unknown): FormState {
  if (!(error instanceof ApiError)) return { error: OFFLINE };

  if (error.status === 403) return { error: "Esa no es tu contraseña actual." };
  if (error.status === 401) return { error: "Tu sesión ha caducado. Vuelve a entrar." };

  return commonFailure(error);
}

const OFFLINE = "No se pudo conectar con el libro. Inténtalo otra vez.";

/** Lo que se lee igual en cualquier formulario: el tope de intentos y los campos. */
function commonFailure(error: ApiError): FormState {
  if (error.status === 429) {
    return { error: "Demasiados intentos. Espera un minuto y vuelve a probar." };
  }

  const issues = error.failure.issues;
  if (issues && issues.length > 0) {
    return {
      error: "Revisa los datos.",
      issues: Object.fromEntries(issues.map(({ field, message }) => [field, message])),
    };
  }

  return { error: error.message };
}
