import { describe, expect, it } from "vitest";

import { formatUsd } from "./money";

describe("formatUsd", () => {
  it("pone siempre los dos decimales", () => {
    expect(formatUsd(1_050n)).toBe("$10.50");
    expect(formatUsd(1_005n)).toBe("$10.05");
    expect(formatUsd(1_000n)).toBe("$10.00");
  });

  it("con menos de un dólar no se come el cero", () => {
    expect(formatUsd(5n)).toBe("$0.05");
    expect(formatUsd(50n)).toBe("$0.50");
    expect(formatUsd(0n)).toBe("$0.00");
  });

  it("el signo va delante del símbolo, no en medio", () => {
    expect(formatUsd(-1_050n)).toBe("-$10.50");
    expect(formatUsd(-5n)).toBe("-$0.05");
  });

  it("no se rompe con importes que no caben en un entero de JavaScript", () => {
    expect(formatUsd(9_007_199_254_740_993n)).toBe("$90071992547409.93");
  });
});
