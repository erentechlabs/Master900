import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { limitBy } from "@/lib/rate-limit";
import { randomToken } from "@/lib/random";
import { signInSchema } from "./schemas";

export const BCRYPT_ROUNDS = 12;

// Hash of a random value, compared when the account does not exist so that
// response timing does not reveal which e-mail addresses are registered.
let dummyHash: string | undefined;
function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync(randomToken(), BCRYPT_ROUNDS);
  return dummyHash;
}

function headerValue(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
  const value = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] : value;
}

function sessionMaxAgeSeconds(): number {
  const hours = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);
  return Math.max(1, Number.isFinite(hours) ? hours : 8) * 60 * 60;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: sessionMaxAgeSeconds(), updateAge: 15 * 60 },
  jwt: { maxAge: sessionMaxAgeSeconds() },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ip = headerValue(req?.headers, "x-forwarded-for")?.split(",")[0]?.trim() || "local";

        if (!limitBy("signInIp", ip).ok || !limitBy("signIn", `${ip}:${email}`).ok) {
          logger.warn("auth.rate_limited", { ip });
          throw new Error("RateLimited");
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, passwordHash: true, status: true, sessionVersion: true },
        });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
        if (!user || !valid) {
          logger.info("auth.sign_in_failed", { reason: user ? "bad_password" : "unknown_user" });
          return null;
        }
        if (user.status !== "ACTIVE") {
          logger.info("auth.sign_in_blocked", { userId: user.id });
          throw new Error("AccountSuspended");
        }
        await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
        logger.info("auth.sign_in", { userId: user.id });
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = user.sessionVersion ?? 1;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.uid ?? "", name: session.user?.name ?? null, email: session.user?.email ?? null };
      session.sv = token.sv ?? 0;
      return session;
    },
  },
};
