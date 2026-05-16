import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import Google from "next-auth/providers/google";
import { getAuthEnvOrThrow } from "@/lib/auth-env";

const authEnv = getAuthEnvOrThrow();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authEnv.authSecret,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: authEnv.googleClientId,
      clientSecret: authEnv.googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { 
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  trustHost: true,
});
