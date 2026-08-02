export {};

async function main() {
  const prismaModule = await import("../lib/prisma");
  const prisma = (
    prismaModule as unknown as {
      prisma: {
        user: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        session: {
          create: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        $disconnect: () => Promise<void>;
      };
    }
  ).prisma;

  const admin = await prisma.user.findUnique({
    where: { email: "justuslaw66@gmail.com" },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin user not found");

  const sessionToken = `temp-admin-${Date.now()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: admin.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const cookie = `authjs.session-token=${sessionToken}`;
  const response = await fetch("http://localhost:3000/api/admin/models/dining-real-castlery-brighton-oval-180", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ foo: "bar" }),
  });

  const rawText = await response.text();
  let payload: unknown = {};
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { rawText: rawText.slice(0, 8000) };
  }

  await prisma.session.deleteMany({ where: { sessionToken } });
  await prisma.$disconnect();

  console.log(JSON.stringify({ status: response.status, payload }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
