import { prisma } from "@/db";
import { hash, verify } from "@/utils/hash";
import { signToken } from "@/utils/jwt";
import { generateOtp } from "@/utils/otp";
import { MailError, sendOtpEmail } from "@/utils/mailer";
import { env } from "@/config/env";
import { httpError } from "@/utils/errors";

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "teacher" | "student";
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing)
    throw Object.assign(new Error("Email already in use"), { status: 409 });

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hash(input.password),
    },
  });

  const token = signToken({ sub: user.id, role: user.role });
  return { token, user: sanitize(user) };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verify(password, user.passwordHash))) {
    throw Object.assign(new Error("Invalid email or password"), {
      status: 401,
    });
  }
  if (user.status === "inactive") {
    throw Object.assign(new Error("This account has been deactivated"), {
      status: 403,
    });
  }
  const token = signToken({ sub: user.id, role: user.role });
  return { token, user: sanitize(user) };
}

/**
 * What the caller may tell the browser about delivery. Everything here is development
 * help for when no mail provider is configured; it is empty in production.
 */
export type ResetRequestResult = {
  /** The code itself, only when it wasn't emailed anywhere. */
  devCode?: string;
  mailMode?: string;
  /** The saved copy of the mail, in "log" mode. */
  outboxPath?: string;
  /** Browser-viewable copy, in "ethereal" mode. */
  previewUrl?: string;
};

export async function requestPasswordReset(
  email: string,
): Promise<ResetRequestResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success to avoid user enumeration
  if (!user) return {};

  // Only the newest code should work: mark any earlier unused one as spent, so a
  // resend can't be defeated by an attacker holding on to an older code.
  await prisma.otpCode.updateMany({
    where: { userId: user.id, purpose: "password_reset", consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp();
  await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash: await hash(code),
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });

  let sent;
  try {
    sent = await sendOtpEmail(email, code);
  } catch (e) {
    if (!(e instanceof MailError)) throw e;
    // The code is stored and still valid, so a retry can deliver it.
    console.error(e.message, e.cause);
    throw httpError(
      502,
      "We couldn't send the email just now. Please try again in a minute.",
    );
  }

  // Dev convenience: with no provider configured the code would otherwise be
  // unreachable from the browser. Never exposed in production — mailMode() is
  // always "smtp" there, because the server refuses to start otherwise.
  if (env.NODE_ENV === "production" || sent.mode === "smtp") return {};
  return {
    devCode: code,
    mailMode: sent.mode,
    outboxPath: sent.outboxPath,
    previewUrl: sent.previewUrl,
  };
}

export async function verifyOtp(email: string, code: string) {
  const otp = await findActiveOtp(email);
  if (!otp)
    throw Object.assign(new Error("Invalid or expired code"), { status: 400 });

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error("Too many attempts"), { status: 429 });
  }

  if (!(await verify(code, otp.codeHash))) {
    // Only wrong guesses count, so re-checking a good code can't lock the user out
    // between the verify screen and the new-password screen.
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw Object.assign(new Error("Invalid code"), { status: 400 });
  }
  return { ok: true };
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
) {
  const otp = await findActiveOtp(email);
  if (!otp)
    throw Object.assign(new Error("Invalid or expired code"), { status: 400 });

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error("Too many attempts"), { status: 429 });
  }

  if (!(await verify(code, otp.codeHash))) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw Object.assign(new Error("Invalid code"), { status: 400 });
  }

  const passwordHash = await hash(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: otp.userId }, data: { passwordHash } }),
    prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    }),
  ]);
}

async function findActiveOtp(email: string) {
  return prisma.otpCode.findFirst({
    where: {
      purpose: "password_reset",
      consumedAt: null,
      expiresAt: { gt: new Date() },
      user: { email },
    },
    orderBy: { createdAt: "desc" },
  });
}

function sanitize<T extends { passwordHash: string }>(user: T) {
  const { passwordHash, ...rest } = user;
  return rest;
}
