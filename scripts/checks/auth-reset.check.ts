// Forgot password + OTP: the code is delivered, only the newest one works, wrong
// guesses are capped, and an unknown email gives nothing away.
//
// With MAIL_TRANSPORT=log (the default when no SMTP credentials are set) the API
// returns the code so this suite can walk the whole flow. Against a server that is
// really emailing, the code-dependent checks are skipped and the rest still run.
import { readFile, rm } from "node:fs/promises";
import { call, check, created, finish, suffix } from "./lib.ts";
import { adminToken } from "./lib.ts";

type Forgot = {
  ok: boolean;
  devCode?: string;
  mailMode?: string;
  outboxPath?: string;
};

const outbox: string[] = [];
let skipped = 0;
const skip = (label: string) => {
  skipped++;
  console.log(`SKIP ${label} (server is sending real mail)`);
};

try {
  const admin = await adminToken();

  const email = `reset-${suffix}@example.test`;
  const PASSWORD = "Passw0rd!1";
  const NEW_PASSWORD = "NewPassw0rd!2";
  const user = await call("setup: create the user", "POST", "/users", admin,
    { name: `Reset ${suffix}`, email, password: PASSWORD, role: "student" }, 201);
  created.users.push(user.body.data.id);

  const ask = async (label: string, to = email) => {
    const res = await call(label, "POST", "/auth/forgot-password", undefined, { email: to }, 200);
    const body = res.body as Forgot;
    if (body.outboxPath) outbox.push(body.outboxPath);
    return body;
  };

  // ---- an unknown email is answered exactly like a known one ----
  const unknown = await ask("an unknown email → 200", `nobody-${suffix}@example.test`);
  check("no code comes back for an address that doesn't exist", !unknown.devCode);

  // ---- the code is delivered ----
  const first = await ask("the user asks for a code → 200");
  const live = !first.devCode;
  if (live) {
    skip("the code reaches the caller");
    skip("a copy of the mail is saved");
  } else {
    check("the code comes back as six digits", /^\d{6}$/.test(first.devCode!));
    check("and says it wasn't emailed", first.mailMode === "log");
    const saved = await readFile(first.outboxPath!, "utf8");
    check("a copy of the mail is saved, with the code in it",
      saved.includes(first.devCode!) && saved.includes(email));
  }

  if (live) {
    // Nothing below can run without the code, but the rules that don't need it can.
    skip("the rest of the flow");
    await call("a 5-digit code → 400", "POST", "/auth/verify-otp", undefined, { email, code: "12345" }, 400);
    await call("a non-numeric code → 400", "POST", "/auth/verify-otp", undefined, { email, code: "abcdef" }, 400);
    await call("a malformed email → 400", "POST", "/auth/forgot-password", undefined, { email: "not-an-email" }, 400);
    await call("a short new password → 400", "POST", "/auth/reset-password", undefined,
      { email, code: "123456", password: "short" }, 400);
  } else {
    const code = first.devCode!;

    // ---- verifying ----
    await call("a wrong code → 400", "POST", "/auth/verify-otp", undefined, { email, code: "000000" }, 400);
    await call("the right code → 200", "POST", "/auth/verify-otp", undefined, { email, code }, 200);
    await call("the right code again, between screens → 200", "POST", "/auth/verify-otp", undefined, { email, code }, 200);

    // ---- asking again replaces the old code ----
    const second = await ask("the user asks again → 200");
    check("the second code is a different one", second.devCode !== code);
    await call("the first code is dead → 400", "POST", "/auth/verify-otp", undefined, { email, code }, 400);
    await call("the newest code works → 200", "POST", "/auth/verify-otp", undefined,
      { email, code: second.devCode }, 200);

    // ---- setting the new password ----
    await call("setting the new password → 200", "POST", "/auth/reset-password", undefined,
      { email, code: second.devCode, password: NEW_PASSWORD }, 200);
    await call("the new password signs in → 200", "POST", "/auth/login", undefined,
      { email, password: NEW_PASSWORD }, 200);
    await call("the old password doesn't → 401", "POST", "/auth/login", undefined,
      { email, password: PASSWORD }, 401);
    await call("the used code can't be replayed → 400", "POST", "/auth/reset-password", undefined,
      { email, code: second.devCode, password: "Another1!pass" }, 400);

    // ---- five wrong guesses and the code is burnt ----
    const third = await ask("a fresh code for the guessing test → 200");
    for (let i = 1; i <= 6; i++) {
      // Five guesses are allowed; the sixth finds the code already spent.
      await call(`wrong guess ${i} → ${i <= 5 ? 400 : 429}`, "POST", "/auth/verify-otp", undefined,
        { email, code: "000000" }, i <= 5 ? 400 : 429);
    }
    await call("the real code is locked out too → 429", "POST", "/auth/verify-otp", undefined,
      { email, code: third.devCode }, 429);
    await call("and it can't set a password either → 429", "POST", "/auth/reset-password", undefined,
      { email, code: third.devCode, password: "Another1!pass" }, 429);

    // ---- a fresh request clears the lockout ----
    const fourth = await ask("asking again after the lockout → 200");
    await call("the new code works → 200", "POST", "/auth/verify-otp", undefined,
      { email, code: fourth.devCode }, 200);

    // ---- validation ----
    await call("a 5-digit code → 400", "POST", "/auth/verify-otp", undefined, { email, code: "12345" }, 400);
    await call("a non-numeric code → 400", "POST", "/auth/verify-otp", undefined, { email, code: "abcdef" }, 400);
    await call("a malformed email → 400", "POST", "/auth/forgot-password", undefined, { email: "not-an-email" }, 400);
    await call("a short new password → 400", "POST", "/auth/reset-password", undefined,
      { email, code: fourth.devCode, password: "short" }, 400);
  }

  if (skipped) console.log(`\n${skipped} group(s) skipped: this server is sending real mail.`);
} catch (e) {
  await cleanOutbox();
  await finish(e);
}

await cleanOutbox();
await finish();

/** The log transport writes a file per mail; don't leave this suite's behind. */
async function cleanOutbox() {
  await Promise.all(outbox.map((f) => rm(f, { force: true })));
  if (outbox.length) console.log(`cleanup: removed ${outbox.length} saved mail file(s)`);
}
