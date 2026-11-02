import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { upsertMemberAccountCredentials } from "../src/lib/auth";

async function main(): Promise<void> {
  const [usernameArg, passwordArg] = process.argv.slice(2);

  if (!usernameArg || !passwordArg) {
    console.error(
      "Penggunaan: npm run auth:set-password -- <username_atau_nama> <password_minimal_8_karakter>"
    );
    process.exitCode = 1;
    return;
  }

  const normalized = usernameArg.trim().toLowerCase();

  const existingAccount = await prisma.userAccount.findUnique({
    where: { username: normalized },
    include: { member: true },
  });

  const member =
    existingAccount?.member ??
    (await prisma.member.findFirst({
      where: {
        name: { equals: usernameArg.trim(), mode: "insensitive" },
      },
    }));

  if (!member) {
    console.error(
      `Anggota dengan nama atau username "${usernameArg}" tidak ditemukan di database.`
    );
    process.exitCode = 1;
    return;
  }

  const account = await upsertMemberAccountCredentials(prisma, {
    memberId: member.id,
    username: normalized,
    plainPassword: passwordArg,
  });

  console.log(
    `[Auth] Berhasil memperbarui kredensial login untuk ${member.name} (username: @${account.username}).`
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Auth] Gagal: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

