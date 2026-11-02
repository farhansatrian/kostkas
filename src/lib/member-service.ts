import { z } from "zod";
import type { Member, PrismaClient } from "../generated/prisma/client";
import {
  assertAuthenticatedActor,
  type AuthenticatedActor,
  hashPassword,
} from "./auth";

export interface MemberDirectoryItem {
  id: string;
  name: string;
  username: string | null;
  accountActive: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  isActiveMember: boolean;
  isCashCustodian: boolean;
  custodianAccountNames: string[];
  totalChargesCount: number;
  unpaidAmount: number;
}

export const CreateMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nama anggota minimal 2 karakter.")
    .max(80, "Nama anggota maksimal 80 karakter."),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter.")
    .max(40, "Username maksimal 40 karakter.")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung."
    )
    .transform((v) => v.toLowerCase()),
  initialPassword: z
    .string()
    .min(8, "Password awal minimal 8 karakter.")
    .max(128, "Password maksimal 128 karakter."),
  joinedAt: z.date().optional(),
});

export const DeactivateMemberSchema = z.object({
  targetMemberId: z.string().uuid("ID anggota tidak valid."),
  leftAt: z.date().optional(),
});

/**
 * Mengambil daftar seluruh anggota (aktif maupun nonaktif) beserta status akun login,
 * status penanggung jawab kas DANA, dan ringkasan kewajiban iuran.
 */
export async function listMembersDirectory(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<MemberDirectoryItem[]> {
  assertAuthenticatedActor(actor);

  const members = await db.member.findMany({
    include: {
      userAccount: {
        select: {
          username: true,
          isActive: true,
        },
      },
      custodianAccounts: {
        where: { isActive: true },
        select: {
          name: true,
          provider: true,
        },
      },
      contributionCharges: {
        where: { status: { not: "CANCELLED" } },
        select: {
          amount: true,
          allocatedAmount: true,
        },
      },
    },
    orderBy: [{ joinedAt: "asc" }, { name: "asc" }],
  });

  // Urutkan anggota aktif terlebih dahulu, kemudian anggota nonaktif
  const sorted = [...members].sort((a, b) => {
    const aActive = a.leftAt === null ? 0 : 1;
    const bActive = b.leftAt === null ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  return sorted.map((m) => {
    const unpaidAmount = m.contributionCharges.reduce(
      (sum, c) => sum + Math.max(0, c.amount - c.allocatedAmount),
      0
    );

    return {
      id: m.id,
      name: m.name,
      username: m.userAccount?.username ?? null,
      accountActive: Boolean(m.userAccount?.isActive && m.leftAt === null),
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      isActiveMember: m.leftAt === null,
      isCashCustodian: m.custodianAccounts.length > 0,
      custodianAccountNames: m.custodianAccounts.map(
        (acc) => `${acc.provider} (${acc.name})`
      ),
      totalChargesCount: m.contributionCharges.length,
      unpaidAmount,
    };
  });
}

/**
 * Menambahkan anggota kost baru beserta akun login terhubung.
 * Seluruh anggota aktif memiliki hak akses setara untuk mengelola keanggotaan.
 */
export async function createMemberWithAccount(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<{ member: Member; username: string }> {
  const validActor = assertAuthenticatedActor(actor);

  const parsed = CreateMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Input anggota baru tidak valid.");
  }

  const { name, username, initialPassword, joinedAt } = parsed.data;
  const passwordHash = await hashPassword(initialPassword);

  return db.$transaction(async (tx) => {
    const existingUsername = await tx.userAccount.findUnique({
      where: { username },
    });

    if (existingUsername) {
      throw new Error(`Username @${username} sudah digunakan oleh anggota lain.`);
    }

    const member = await tx.member.create({
      data: {
        name,
        joinedAt: joinedAt ?? new Date(),
        leftAt: null,
      },
    });

    const account = await tx.userAccount.create({
      data: {
        memberId: member.id,
        username,
        passwordHash,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "CREATE_MEMBER",
        entityType: "Member",
        entityId: member.id,
        summary: `Menambahkan anggota baru ${member.name} (@${account.username})`,
      },
    });

    return {
      member,
      username: account.username,
    };
  });
}

/**
 * Menonaktifkan anggota kost yang sudah keluar (`leftAt` diisi) tanpa menghapus histori transaksi.
 * Sesi aktif anggota tersebut otomatis dicabut dan akun login dinonaktifkan.
 */
export async function deactivateMember(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<Member> {
  const validActor = assertAuthenticatedActor(actor);

  const parsed = DeactivateMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message ?? "Input penonaktifan anggota tidak valid.");
  }

  const { targetMemberId, leftAt } = parsed.data;

  return db.$transaction(async (tx) => {
    const targetMember = await tx.member.findUnique({
      where: { id: targetMemberId },
      include: {
        userAccount: true,
        custodianAccounts: {
          where: { isActive: true },
        },
      },
    });

    if (!targetMember) {
      throw new Error("Data anggota tidak ditemukan.");
    }

    if (targetMember.leftAt !== null) {
      throw new Error(`Anggota ${targetMember.name} sudah berstatus nonaktif.`);
    }

    if (targetMember.custodianAccounts.length > 0) {
      throw new Error(
        `Anggota ${targetMember.name} sedang tercatat sebagai pemegang rekening kas aktif dan tidak dapat dinonaktifkan sebelum penanggung jawab kas dialihkan.`
      );
    }

    const activeCount = await tx.member.count({
      where: { leftAt: null },
    });

    if (activeCount <= 1) {
      throw new Error(
        "Tidak dapat menonaktifkan anggota terakhir karena minimal harus ada 1 anggota aktif."
      );
    }

    const effectiveLeftAt = leftAt ?? new Date();

    const updatedMember = await tx.member.update({
      where: { id: targetMember.id },
      data: {
        leftAt: effectiveLeftAt,
      },
    });

    if (targetMember.userAccount) {
      await tx.userAccount.update({
        where: { id: targetMember.userAccount.id },
        data: { isActive: false },
      });

      await tx.authSession.updateMany({
        where: {
          userAccountId: targetMember.userAccount.id,
          revokedAt: null,
        },
        data: {
          revokedAt: effectiveLeftAt,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "DEACTIVATE_MEMBER",
        entityType: "Member",
        entityId: updatedMember.id,
        summary: `Menonaktifkan keanggotaan ${updatedMember.name} (histori transaksi tetap tersimpan)`,
      },
    });

    return updatedMember;
  });
}

/**
 * Mengaktifkan kembali anggota yang sebelumnya dinonaktifkan.
 */
export async function reactivateMember(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  targetMemberId: string
): Promise<Member> {
  const validActor = assertAuthenticatedActor(actor);

  const validId = z.string().uuid("ID anggota tidak valid.").parse(targetMemberId);

  return db.$transaction(async (tx) => {
    const targetMember = await tx.member.findUnique({
      where: { id: validId },
      include: { userAccount: true },
    });

    if (!targetMember) {
      throw new Error("Data anggota tidak ditemukan.");
    }

    const updatedMember = await tx.member.update({
      where: { id: targetMember.id },
      data: { leftAt: null },
    });

    if (targetMember.userAccount) {
      await tx.userAccount.update({
        where: { id: targetMember.userAccount.id },
        data: { isActive: true },
      });
    }

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "REACTIVATE_MEMBER",
        entityType: "Member",
        entityId: updatedMember.id,
        summary: `Mengaktifkan kembali keanggotaan ${updatedMember.name}`,
      },
    });

    return updatedMember;
  });
}

