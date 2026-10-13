import { prisma } from "@/db";
import { hash, verify } from "@/utils/hash";
import { signToken } from "@/utils/jwt";
import { generateOtp } from "@/utils/otp";
import { sendOtpEmail } from "@/utils/mailer";

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

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success to avoid user enumeration
  if (!user) return;

  const code = generateOtp();
  await prisma.otpCode.create({
    data: {
      userId: user.id,
      codeHash: await hash(code),
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
    },
  });

  await sendOtpEmail(email, code);
}

export async function verifyOtp(email: string, code: string) {
  const otp = await findActiveOtp(email);
  if (!otp)
    throw Object.assign(new Error("Invalid or expired code"), { status: 400 });

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw Object.assign(new Error("Too many attempts"), { status: 429 });
  }

  const ok = await verify(code, otp.codeHash);
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
  });

  if (!ok) throw Object.assign(new Error("Invalid code"), { status: 400 });
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

  const ok = await verify(code, otp.codeHash);
  if (!ok) throw Object.assign(new Error("Invalid code"), { status: 400 });

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
