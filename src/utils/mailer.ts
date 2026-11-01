import fs from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/config/env";

/**
 * Mail delivery with a dev fallback.
 *
 * Three modes, chosen by MAIL_TRANSPORT (default "auto"):
 *  - "smtp"     real delivery through SMTP_*; the only mode allowed in production.
 *  - "log"      nothing leaves the machine: the mail is written to MAIL_OUTBOX_DIR
 *               and the code is printed to the server log. Lets the OTP and
 *               password-reset flows work with no mail provider configured.
 *  - "ethereal" a throwaway inbox from nodemailer; prints a preview URL you can
 *               open in a browser. Needs network, no account or keys.
 *
 * "auto" picks "smtp" when SMTP_HOST/USER/PASS are filled in with something that
 * isn't an obvious placeholder, and "log" otherwise.
 */

export type MailMode = "smtp" | "log" | "ethereal";

export type SentMail = {
  mode: MailMode;
  /** Where the mail landed in "log" mode. */
  outboxPath?: string;
  /** Browser-viewable copy in "ethereal" mode. */
  previewUrl?: string;
};

/** Thrown when delivery itself failed, so callers can answer 502 rather than 500. */
export class MailError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MailError";
  }
}

const PLACEHOLDER = /^(your[-_ ]?|xxx|changeme|placeholder|todo|secret$|smtp[-_]?pass)/i;

const smtpConfigured = () =>
  Boolean(
    env.SMTP_HOST &&
      env.SMTP_USER &&
      env.SMTP_PASS &&
      !PLACEHOLDER.test(env.SMTP_PASS),
  );

export function mailMode(): MailMode {
  if (env.MAIL_TRANSPORT !== "auto") return env.MAIL_TRANSPORT;
  return smtpConfigured() ? "smtp" : "log";
}

let cached: Promise<Transporter> | null = null;

function transport() {
  cached ??= build();
  return cached;
}

async function build(): Promise<Transporter> {
  const mode = mailMode();

  if (mode === "log") return nodemailer.createTransport({ jsonTransport: true });

  if (mode === "ethereal") {
    const account = await nodemailer.createTestAccount();
    console.log(
      `✉  Mail is going to an Ethereal test inbox (${account.user}). ` +
        "Each send logs a preview URL.",
    );
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Without these a wrong host hangs the request for a minute or more.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/**
 * Called once at startup. Refuses to boot a production server that can't send mail,
 * and says out loud which mode dev is running in so a missing email is never a mystery.
 */
export async function checkMailer() {
  const mode = mailMode();

  if (env.NODE_ENV === "production" && mode !== "smtp") {
    throw new Error(
      "Mail is not configured: set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM " +
        "(MAIL_TRANSPORT=log is for development only).",
    );
  }

  if (mode === "log") {
    console.log(
      `✉  Mail mode: log — nothing is actually emailed. Codes are printed here and ` +
        `copies saved to ${path.resolve(env.MAIL_OUTBOX_DIR)}/. ` +
        "Fill in SMTP_* in .env to send real mail.",
    );
    return;
  }

  if (mode === "smtp") {
    try {
      await (await transport()).verify();
      console.log(`✉  Mail mode: smtp — ${env.SMTP_HOST} ready.`);
    } catch (e) {
      // A dead mail server shouldn't stop the API from serving everything else.
      console.warn(
        `⚠  Mail mode: smtp — ${env.SMTP_HOST} rejected the connection ` +
          `(${e instanceof Error ? e.message : e}). Password resets will fail ` +
          "until that's fixed; MAIL_TRANSPORT=log works offline.",
      );
    }
  }
}

async function writeOutbox(to: string, subject: string, html: string) {
  const dir = path.resolve(env.MAIL_OUTBOX_DIR);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${to.replace(/[^\w.@-]/g, "_")}.html`);
  await fs.writeFile(
    file,
    `<!-- to: ${to}\n     subject: ${subject} -->\n${html}`,
    "utf8",
  );
  return file;
}

async function deliver(to: string, subject: string, html: string, text: string) {
  const mode = mailMode();
  try {
    const info = await (await transport()).sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
      text,
    });

    if (mode === "log") {
      return { mode, outboxPath: await writeOutbox(to, subject, html) };
    }
    if (mode === "ethereal") {
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) console.log(`✉  Preview the mail to ${to}: ${previewUrl}`);
      return { mode, previewUrl };
    }
    return { mode };
  } catch (e) {
    throw new MailError(
      `Could not send "${subject}" to ${to} over ${mode}`,
      e,
    );
  }
}

const OTP_SUBJECT = "Your EduCore verification code";

export async function sendOtpEmail(to: string, code: string): Promise<SentMail> {
  const html = `
      <div style="font-family:Inter,sans-serif;padding:24px">
        <h2 style="color:#0F172A">Verification code</h2>
        <p>Your code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#6366F1">${code}</p>
        <p style="color:#64748B">This code expires in 10 minutes. If you didn't ask
          to reset your password, you can ignore this email.</p>
      </div>`;

  const sent = await deliver(
    to,
    OTP_SUBJECT,
    html,
    `Your EduCore verification code is ${code}. It expires in 10 minutes.`,
  );

  if (sent.mode === "log") {
    console.log(`\n✉  [mail:log] verification code for ${to} → ${code}\n`);
  }
  return sent;
}
