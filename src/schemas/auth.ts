import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().email("Correo invalido."),
  password: z.string().min(1, "La contrasena es obligatoria."),
});
