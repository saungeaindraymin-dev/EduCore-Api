import nodemailer from "nodemailer";
import { env } from "@/config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendOtpEmail(to: string, code: string) {
  await transporter.sendMail({
    from: env.MAIL_FROM,
    to,
    subject: "Your EduCore verification code",
    html: `
      <div style="font-family:Inter,sans-serif;padding:24px">
        <h2 style="color:#0F172A">Verification code</h2>
        <p>Your code is:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;
          background:linear-gradient(135deg,#6366F1,#8B5CF6,#EC4899);
          -webkit-background-clip:text;background-clip:text;color:transparent">${code}</p>
        <p style="color:#64748B">This code expires in 10 minutes.</p>
      </div>`,
  });
}
