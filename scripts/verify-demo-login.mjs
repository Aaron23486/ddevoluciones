import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "./demo-users.mjs";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD;

if (!url || !publishableKey) {
  throw new Error("Supabase public environment variables are missing.");
}
if (!password) {
  throw new Error("DEMO_USERS_PASSWORD is required for verification.");
}

for (const demo of DEMO_USERS) {
  const client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({
      email: demo.email,
      password,
    });

  if (signInError || !signInData.user) {
    throw new Error(
      `LOGIN FAIL ${demo.email}: ${signInError?.message ?? "no user"}`,
    );
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("email,role,is_active")
    .eq("id", signInData.user.id)
    .single();

  if (profileError) {
    throw new Error(`PROFILE FAIL ${demo.email}: ${profileError.message}`);
  }

  if (
    profile.email !== demo.email ||
    profile.role !== demo.role ||
    profile.is_active !== true
  ) {
    throw new Error(
      `CONTRACT FAIL ${demo.email}: expected ${demo.role}/active, got ${profile.role}/${profile.is_active}`,
    );
  }

  await client.auth.signOut();
  console.log(`OK  ${demo.role.padEnd(13)} ${demo.email}`);
}

console.log(`\nLogin verification passed: ${DEMO_USERS.length}/7`);
