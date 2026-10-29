import { createInterface, type Interface } from "node:readline/promises";
import { Writable } from "node:stream";

import type { z } from "zod";

// Una sola interfaz para todas las preguntas: si se crea una por pregunta, la primera consume
// toda la entrada cuando llega por tubería (por ejemplo `printf ... | npm run users -- create`).
let rl: Interface | undefined;
let pipedLines: AsyncIterator<string> | undefined;
let muted = false;

function prompt(): Interface {
  rl ??= createInterface({
    input: process.stdin,
    output: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    }),
    terminal: process.stdin.isTTY === true,
  });
  return rl;
}

export function closePrompt(): void {
  rl?.close();
  rl = undefined;
  pipedLines = undefined;
}

async function nextPipedLine(question: string): Promise<string> {
  process.stdout.write(question);
  pipedLines ??= prompt()[Symbol.asyncIterator]();
  const { value, done } = await pipedLines.next();
  process.stdout.write("\n");
  if (done) {
    throw new Error(
      "La entrada terminó antes de responder todas las preguntas.",
    );
  }
  return value;
}

// Con `hidden` no se muestra lo que se escribe (contraseñas).
export async function ask(question: string, hidden = false): Promise<string> {
  if (process.stdin.isTTY !== true) return nextPipedLine(question);
  const answer = prompt().question(question);
  muted = hidden;
  try {
    return await answer;
  } finally {
    muted = false;
    if (hidden) process.stdout.write("\n");
  }
}

// Toma el valor de una variable de entorno o lo pregunta hasta que sea válido.
export async function askValid<T extends z.ZodType>(
  schema: T,
  question: string,
  { envValue, hidden = false }: { envValue?: string; hidden?: boolean } = {},
): Promise<z.output<T>> {
  if (envValue) {
    const result = schema.safeParse(envValue);
    if (!result.success) throw new Error(result.error.issues[0]?.message);
    return result.data;
  }
  for (;;) {
    const result = schema.safeParse(await ask(question, hidden));
    if (result.success) return result.data;
    console.error(`  ${result.error.issues[0]?.message}`);
  }
}

// Pide una contraseña nueva dos veces (o la toma del entorno sin confirmar).
export async function askNewPassword(
  schema: z.ZodType<string>,
  envValue?: string,
): Promise<string> {
  const password = await askValid(
    schema,
    "Contraseña (mín. 12 caracteres, letras y números): ",
    { envValue, hidden: true },
  );
  if (!envValue && (await ask("Repite la contraseña: ", true)) !== password) {
    throw new Error("Las contraseñas no coinciden.");
  }
  return password;
}
