import { randomInt } from "node:crypto";

/** Cada usuario tiene un código único de 10 dígitos para recibir invitaciones. */
export const USER_CODE_LENGTH = 10;

/**
 * Genera un código de 10 dígitos. El primero nunca es 0 para que el código no pierda
 * dígitos si alguien lo escribe en un campo numérico.
 */
export function generateUserCode(random: (min: number, max: number) => number = randomInt): string {
  let code = String(random(1, 10));
  while (code.length < USER_CODE_LENGTH) {
    code += String(random(0, 10));
  }
  return code;
}

export function isValidUserCode(code: unknown): code is string {
  return typeof code === "string" && code.length === USER_CODE_LENGTH && /^\d+$/.test(code);
}
