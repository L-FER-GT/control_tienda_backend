import { describe, expect, it } from "vitest";
import { removedFiles } from "../src/domain/files";
import { formatBytes, invitationText, usageAlertText } from "../src/domain/messages";
import { FREE_QUOTAS, levelOf, periodId, toMetric, windowStart } from "../src/domain/quotas";
import {
  EMPTY_LEDGER,
  ledgerFrom,
  orderStockDeltas,
  receptionCostChanges,
  receptionStockDeltas,
} from "../src/domain/stock";
import { startOfDayInZone, startOfMonthInZone } from "../src/domain/time";
import { generateUserCode, isValidUserCode } from "../src/domain/userCode";

describe("código de usuario", () => {
  it("tiene 10 dígitos y no empieza en 0", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUserCode();
      expect(isValidUserCode(code)).toBe(true);
      expect(code[0]).not.toBe("0");
    }
  });

  it("rechaza códigos inválidos", () => {
    expect(isValidUserCode("123")).toBe(false);
    expect(isValidUserCode("12345abcde")).toBe(false);
    expect(isValidUserCode(1234567890)).toBe(false);
  });
});

describe("cuotas", () => {
  it("alerta desde el 80 %", () => {
    expect(levelOf(39_999, 50_000)).toBe("OK");
    expect(levelOf(40_000, 50_000)).toBe("WARNING");
    expect(levelOf(50_000, 50_000)).toBe("EXCEEDED");
  });

  it("los umbrales al 80 % coinciden con la tabla acordada", () => {
    const limit = (key: string) => FREE_QUOTAS.find((q) => q.key === key)!.limit * 0.8;
    expect(limit("firestore_reads")).toBe(40_000);
    expect(limit("firestore_writes")).toBe(16_000);
    expect(limit("storage_bytes")).toBe(4 * 1024 ** 3);
    expect(limit("storage_egress")).toBe(80 * 1024 ** 3);
  });

  it("el día de la cuota empieza a medianoche del Pacífico", () => {
    // 2026-10-01 15:00 UTC = 08:00 PDT (UTC-7)
    const now = new Date("2026-10-01T15:00:00Z");
    expect(startOfDayInZone(now).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(startOfMonthInZone(now).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    // En invierno (PST, UTC-8)
    expect(startOfDayInZone(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-12-15T08:00:00.000Z");
    expect(windowStart("TOTAL", now)).toBeNull();
  });

  it("identificador de periodo para no repetir alertas", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    expect(periodId("DAY", now)).toBe("2026-10-01");
    expect(periodId("MONTH", now)).toBe("2026-10");
  });

  it("textos de alerta", () => {
    const metric = toMetric(FREE_QUOTAS[0], 41_000);
    expect(usageAlertText(metric).title).toBe("Consumo al 82 %: Lecturas de Firestore");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.00 GB");
  });
});

describe("stock", () => {
  it("una venta descuenta solo productos registrados y agrupa repetidos", () => {
    const deltas = orderStockDeltas([
      { productId: "a", quantity: 2 },
      { productId: "a", quantity: 0.5 },
      { productId: null, quantity: 3, manual: true },
      { productId: "b", quantity: 1, manual: true },
    ]);
    expect(deltas).toEqual({ a: -2.5 });
  });

  it("una recepción nueva suma todo", () => {
    const lines = [{ productId: "a", quantity: 10, unitCostCents: 250 }];
    expect(receptionStockDeltas(EMPTY_LEDGER, lines)).toEqual({ a: 10 });
    expect(receptionCostChanges(EMPTY_LEDGER, lines)).toEqual({ a: 250 });
  });

  it("editar una recepción aplica solo la diferencia", () => {
    const applied = ledgerFrom([
      { productId: "a", quantity: 10, unitCostCents: 250 },
      { productId: "b", quantity: 5, unitCostCents: null },
    ]);
    const edited = [
      { productId: "a", quantity: 12, unitCostCents: 250 },
      { productId: "c", quantity: 1, unitCostCents: 900 },
    ];
    expect(receptionStockDeltas(applied, edited)).toEqual({ a: 2, b: -5, c: 1 });
    expect(receptionCostChanges(applied, edited)).toEqual({ c: 900 });
  });

  it("borrar una recepción revierte el stock", () => {
    const applied = ledgerFrom([{ productId: "a", quantity: 3.3 }]);
    expect(receptionStockDeltas(applied, [])).toEqual({ a: -3.3 });
  });

  it("aplicar dos veces la misma versión no cambia nada (idempotencia)", () => {
    const lines = [{ productId: "a", quantity: 0.1 }, { productId: "a", quantity: 0.2 }];
    expect(receptionStockDeltas(ledgerFrom(lines), lines)).toEqual({});
  });
});

describe("archivos e invitaciones", () => {
  it("detecta fotos reemplazadas y nunca borra rutas ajenas", () => {
    expect(
      removedFiles(
        { photoPath: "stores/s/products/old.jpg", invoicePhotos: ["stores/s/receptions/1.jpg", "https://x"] },
        { photoPath: "stores/s/products/new.jpg", invoicePhotos: [] },
        ["photoPath", "invoicePhotos"],
      ),
    ).toEqual(["stores/s/products/old.jpg", "stores/s/receptions/1.jpg"]);
    expect(removedFiles({ photoPath: "otra/ruta.jpg" }, undefined, ["photoPath"])).toEqual([]);
  });

  it("texto de invitación", () => {
    expect(invitationText("Ana", "Bodega Rosita", "employee").body).toBe(
      'Ana te invita a unirte a "Bodega Rosita" como empleado.',
    );
  });
});
