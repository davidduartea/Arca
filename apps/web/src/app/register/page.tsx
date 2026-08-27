import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Shell } from "@/components/Shell";
import { SignUpScreen } from "@/modules/auth/main/SignUpScreen";
import { currentUser } from "@/modules/auth/queries";

export const metadata: Metadata = { title: "Abrir una cuenta" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/accounts");

  return (
    <Shell signedIn={false}>
      <SignUpScreen />
    </Shell>
  );
}
