"use server";

import { redirect } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { text } from "@/lib/form";
import { clearSession, writeSession } from "@/lib/session";
import { firstMessage, issuesByField } from "@/lib/validation";
import { credentialsSchema, registrationSchema } from "@/models/auth/Credentials";
import type { FormState } from "@/models/auth/FormState";
import type { Session } from "@/models/auth/Session";

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
  const parsed = registrationSchema.safeParse(readCredentials(form));

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
  if (!(error instanceof ApiError)) {
    return { error: "No se pudo conectar con el libro. Inténtalo otra vez." };
  }

  if (error.status === 401) return { error: "El correo o la contraseña no son correctos." };

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
