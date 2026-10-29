import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "./demo-users.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_USERS_PASSWORD;

if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
}
if (!secretKey) {
  throw new Error(
    "SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY is required.",
  );
}
if (!password || password.length < 12) {
  throw new Error("DEMO_USERS_PASSWORD must contain at least 12 characters.");
}

const admin = createClient(url, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function getAllUsers() {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

const existingUsers = await getAllUsers();

for (const demo of DEMO_USERS) {
  let user = existingUsers.find(
    (item) => item.email?.toLowerCase() === demo.email.toLowerCase(),
  );

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: demo.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: demo.fullName,
      },
    });

    if (error) {
      throw new Error(
        `Could not create ${demo.email}: ${error.message}. ` +
          "Apply migration 003_demo_login before running the seed.",
      );
    }
    user = data.user;
    console.log(`CREATED  ${demo.email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        full_name: demo.fullName,
      },
    });
    if (error) throw error;
    console.log(`UPDATED  ${demo.email}`);
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: demo.email,
      full_name: demo.fullName,
      role: demo.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw new Error(
      `Could not provision profile ${demo.email}: ${profileError.message}`,
    );
  }

  // Seeded users are direct demo identities, not pending access requests.
  const { error: requestCleanupError } = await admin
    .from("user_access_requests")
    .delete()
    .eq("user_id", user.id);

  if (requestCleanupError) {
    throw new Error(
      `Could not clean access request for ${demo.email}: ${requestCleanupError.message}`,
    );
  }

  console.log(`PROFILE  ${demo.role.padEnd(13)} ${demo.email}`);
}

console.log(`\nDemo users ready: ${DEMO_USERS.length}/7`);
