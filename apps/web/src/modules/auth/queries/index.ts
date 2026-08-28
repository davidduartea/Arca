import "server-only";
import { cache } from "react";

import { ApiError, api } from "@/lib/api";
import { readToken } from "@/lib/session";
import type { User } from "@/models/auth/User";

/**
 * Lecturas de sesión, **sin** `"use server"`.
 *
 * La distinción importa. Un archivo con `"use server"` publica cada función que
 * exporta como un endpoint invocable desde el navegador: eso es lo que se
 * quiere para un formulario, y superficie regalada para algo que sólo llaman
 * componentes de servidor.
 *
 * `server-only` hace lo contrario — rompe el build si alguien lo importa desde
 * el navegador. Cerrado por arriba y por abajo.
 */

/**
 * Quién está mirando, o nadie.
 *
 * Devuelve `null` en vez de lanzar cuando el token caducó: para quien pregunta
 * es el mismo caso — no hay sesión — y así las pantallas no tienen que
 * distinguir entre «nunca entró» y «se le pasó la hora».
 *
 * Envuelto en `cache` porque lo preguntan varios sitios del mismo render: el
 * guardia del layout, la barra para poner el correo y la página que lo enseña.
 * Sin esto serían tres viajes a `/auth/me` para pintar una pantalla; con esto,
 * uno — la memoria dura lo que dura la petición y no se comparte entre
 * personas, que es justo lo que hace falta aquí.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  if (!(await readToken())) return null;

  try {
    const { user } = await api<{ user: User }>("/auth/me");

    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;

    throw error;
  }
});

/**
 * El correo que hay dentro de la cookie, aunque esté caducada.
 *
 * Sirve para una sola cosa: rellenarlo en la pantalla de sesión caducada, para
 * que sólo haya que escribir la contraseña. La sesión no se cerró — venció, y
 * pedir otra vez el correo sería tratar a alguien como si acabara de llegar.
 *
 * Se lee **sin verificar la firma**, y da igual: no autoriza nada. Como mucho,
 * alguien que se manipule su propia cookie consigue que su propio formulario
 * salga con otro correo escrito.
 */
export async function sessionEmail(): Promise<string | null> {
  const token = await readToken();
  const payload = token?.split(".")[1];
  if (!payload) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) return null;

    const email = (decoded as { email?: unknown }).email;

    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}
