import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { loadDotEnvFile } from "../config/dotenv";
import { formatUsd, toWire } from "../shared/money";
import { AuditModule } from "./audit.module";
import { AuditService } from "./audit.service";
import type { AuditReport } from "./audit.types";

/**
 * La auditoría, como comando y no como endpoint.
 *
 * Es deliberado. Auditar el libro entero es una operación **de explotación**,
 * no algo que pida un cliente: recorre todas las tablas y devuelve el estado
 * global del sistema, que no es asunto de nadie que tenga una cuenta. Sacarlo
 * por la API obligaría además a inventar un rol de administrador para un solo
 * uso.
 *
 * Como comando encaja donde tiene que encajar: un cron que lo lanza de
 * madrugada, un paso de CI, o alguien que lo corre a mano cuando algo huele
 * raro. Y el **código de salida** es lo que lo hace útil sin leerlo: distinto
 * de cero, hay que mirar.
 *
 *   pnpm audit           informe legible
 *   pnpm audit --json    para que lo lea otra máquina
 */
async function main(): Promise<void> {
  loadDotEnvFile();

  const context = await NestFactory.createApplicationContext(AuditModule, {
    // El informe es la salida del comando; los avisos de arranque sobran.
    logger: ["error"],
  });

  try {
    const report = await context.get(AuditService).run();

    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(toJson(report), null, 2));
    } else {
      printReport(report);
    }

    // Un aviso no rompe el comando: no hay dinero en juego, sólo suciedad.
    process.exitCode = report.findings.some((h) => h.severity === "critical") ? 1 : 0;
  } finally {
    await context.close();
  }
}

/** `JSON.stringify` no sabe serializar un `bigint`, así que sale como texto. */
function toJson(report: AuditReport): unknown {
  return {
    ...report,
    checkedAt: report.checkedAt.toISOString(),
    totals: { ...report.totals, netAmount: toWire(report.totals.netAmount) },
  };
}

function printReport(report: AuditReport): void {
  const { totals } = report;

  console.log("\nArca · auditoría del libro");
  console.log(`  cuentas        ${totals.accounts}`);
  console.log(`  transacciones  ${totals.transactions}`);
  console.log(`  asientos       ${totals.entries}`);
  console.log(`  neto           ${formatUsd(totals.netAmount)}   ← tiene que ser cero\n`);

  if (report.clean) {
    console.log("✓ El libro cuadra.\n");
    return;
  }

  const total = report.findings.length;
  const criticalCount = report.findings.filter((f) => f.severity === "critical").length;

  console.log(
    `✗ ${total} ${total === 1 ? "hallazgo" : "hallazgos"}, ` +
      `${criticalCount} ${criticalCount === 1 ? "crítico" : "críticos"}\n`,
  );

  for (const finding of report.findings) {
    console.log(`  [${finding.severity}] ${finding.check} — ${finding.summary}`);
    console.log(`      ${finding.count} ${finding.count === 1 ? "caso" : "casos"}`);

    for (const example of finding.sample) {
      console.log(`      · ${example}`);
    }
    if (finding.count > finding.sample.length) {
      console.log(`      · … y ${finding.count - finding.sample.length} más`);
    }

    console.log("");
  }
}

void main().catch((error: unknown) => {
  console.error("La auditoría no pudo completarse:", error);
  process.exitCode = 2;
});
