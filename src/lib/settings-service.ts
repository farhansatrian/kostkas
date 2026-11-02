import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import {
  assertAuthenticatedActor,
  type AuthenticatedActor,
  hashPassword,
  verifyPassword,
} from "./auth";
import {
  authorizedUpsertContributionPolicy,
  formatPeriodLabel,
  getCurrentYearMonthPeriod,
  shiftYearMonthPeriod,
} from "./contribution-service";
import { getCashLedgerSummary, recordLedgerEntry } from "./financial-service";
import {
  formatJakartaDate,
  getJakartaPeriodBounds,
  JAKARTA_TIMEZONE,
  ReportPeriodSchema,
} from "./reporting-service";

export const UpdateCashAccountSettingsSchema = z.object({
  kostName: z
    .string()
    .trim()
    .min(3, "Nama kas kost minimal 3 karakter.")
    .max(80, "Nama kas kost maksimal 80 karakter."),
  accountName: z
    .string()
    .trim()
    .min(3, "Nama akun kas DANA minimal 3 karakter.")
    .max(80, "Nama akun kas DANA maksimal 80 karakter."),
  provider: z
    .string()
    .trim()
    .min(2, "Nama provider dompet minimal 2 karakter.")
    .max(40, "Nama provider dompet maksimal 40 karakter."),
  custodianMemberId: z
    .string()
    .uuid("Pilih anggota pemegang kas (Cash Custodian) yang valid."),
  cashAccountId: z.string().uuid().optional(),
});

export const UpdateContributionSettingSchema = z.object({
  effectiveFromPeriod: ReportPeriodSchema,
  name: z
    .string()
    .trim()
    .min(3, "Nama kebijakan minimal 3 karakter.")
    .max(100, "Nama kebijakan maksimal 100 karakter."),
  amountPerMember: z.coerce
    .number()
    .int("Tarif iuran harus bilangan bulat Rupiah.")
    .positive("Tarif iuran harus lebih dari Rp0.")
    .max(50_000_000, "Nominal tarif terlalu besar."),
});

export const ChangeOwnPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Password saat ini wajib diisi."),
    newPassword: z
      .string()
      .min(8, "Password baru minimal 8 karakter.")
      .max(128, "Password baru maksimal 128 karakter."),
    confirmNewPassword: z
      .string()
      .min(8, "Konfirmasi password baru minimal 8 karakter."),
  })
  .superRefine((val, ctx) => {
    if (val.newPassword !== val.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmNewPassword"],
        message: "Konfirmasi password baru tidak cocok.",
      });
    }
    if (val.currentPassword === val.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "Password baru harus berbeda dari password lama.",
      });
    }
  });

export const UpdateAppPreferencesSchema = z.object({
  kostName: z
    .string()
    .trim()
    .min(3, "Nama kas bersama minimal 3 karakter.")
    .max(80, "Nama kas bersama maksimal 80 karakter."),
  dateFormat: z.enum(["dd MMM yyyy", "dd/MM/yyyy", "yyyy-MM-dd"]),
});

export const RecordReconciliationAdjustmentSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  amount: z.coerce
    .number()
    .int("Nominal koreksi harus bilangan bulat Rupiah.")
    .positive("Nominal koreksi harus lebih dari Rp0.")
    .max(100_000_000, "Nominal koreksi terlalu besar."),
  reason: z
    .string()
    .trim()
    .min(5, "Alasan koreksi saldo wajib diisi (minimal 5 karakter).")
    .max(180, "Alasan koreksi maksimal 180 karakter."),
  idempotencyKey: z.string().trim().min(6, "Idempotency key diperlukan."),
  cashAccountId: z.string().uuid().optional(),
});

async function verifyActiveActorInDb(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<AuthenticatedActor> {
  const validActor = assertAuthenticatedActor(actor);
  const member = await db.member.findUnique({
    where: { id: validActor.memberId },
    select: { id: true, name: true, leftAt: true },
  });
  if (!member || member.leftAt !== null) {
    throw new Error("Akses ditolak: anggota sudah tidak aktif.");
  }
  return validActor;
}

export interface ManualReconciliationComparison {
  recordedLedgerBalance: number;
  actualDanaBalance: number;
  discrepancyAmount: number;
  absDiscrepancyAmount: number;
  status: "MATCHED" | "SURPLUS_IN_DANA" | "DEFICIT_IN_DANA";
  recommendedDirection: "IN" | "OUT" | null;
  summaryText: string;
}

/**
 * Mengevaluasi selisih rekonsiliasi manual antara saldo tercatat buku besar KostKas
 * dengan saldo aktual akun DANA yang dibaca manual, TANPA melakukan penyesuaian otomatis.
 */
export function evaluateManualCashReconciliation(
  recordedLedgerBalance: number,
  actualDanaBalance: number
): ManualReconciliationComparison {
  if (!Number.isInteger(actualDanaBalance)) {
    throw new Error("Nominal saldo DANA aktual harus berupa bilangan bulat Rupiah.");
  }

  const discrepancyAmount = actualDanaBalance - recordedLedgerBalance;
  const absDiscrepancyAmount = Math.abs(discrepancyAmount);

  if (discrepancyAmount === 0) {
    return {
      recordedLedgerBalance,
      actualDanaBalance,
      discrepancyAmount: 0,
      absDiscrepancyAmount: 0,
      status: "MATCHED",
      recommendedDirection: null,
      summaryText:
        "Saldo tercatat KostKas cocok 100% dengan saldo aktual akun DANA (selisih Rp0).",
    };
  }

  if (discrepancyAmount > 0) {
    return {
      recordedLedgerBalance,
      actualDanaBalance,
      discrepancyAmount,
      absDiscrepancyAmount,
      status: "SURPLUS_IN_DANA",
      recommendedDirection: "IN",
      summaryText: `Saldo aktual DANA lebih besar Rp${absDiscrepancyAmount.toLocaleString("id-ID")} dibanding buku besar KostKas. Periksa apakah ada kas masuk yang belum dicatat atau buat jurnal ADJUSTMENT IN dengan alasan yang jelas.`,
    };
  }

  return {
    recordedLedgerBalance,
    actualDanaBalance,
    discrepancyAmount,
    absDiscrepancyAmount,
    status: "DEFICIT_IN_DANA",
    recommendedDirection: "OUT",
    summaryText: `Saldo aktual DANA lebih kecil Rp${absDiscrepancyAmount.toLocaleString("id-ID")} dibanding buku besar KostKas. Periksa apakah ada pengeluaran langsung yang belum dicatat atau buat jurnal ADJUSTMENT OUT dengan alasan yang jelas.`,
  };
}

/**
 * Bagian A: Memperbarui informasi kas bersama & menunjuk anggota aktif sebagai Cash Custodian
 * dengan jejak audit (AuditLog). Tidak mengizinkan perubahan saldo kas secara langsung.
 */
export async function authorizedUpdateCashAccountSettings(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = UpdateCashAccountSettingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Pengaturan akun kas tidak valid."
    );
  }

  const { kostName, accountName, provider, custodianMemberId } = parsed.data;

  return db.$transaction(async (tx) => {
    const custodian = await tx.member.findUnique({
      where: { id: custodianMemberId },
    });

    if (!custodian || custodian.leftAt !== null) {
      throw new Error(
        "Cash Custodian harus dipilih dari anggota yang masih aktif."
      );
    }

    const cashAccount = parsed.data.cashAccountId
      ? await tx.cashAccount.findUnique({
          where: { id: parsed.data.cashAccountId },
        })
      : await tx.cashAccount.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        });

    if (!cashAccount) {
      throw new Error("Akun kas utama tidak ditemukan.");
    }

    const updatedAccount = await tx.cashAccount.update({
      where: { id: cashAccount.id },
      data: {
        name: accountName,
        provider,
        custodianMemberId: custodian.id,
      },
    });

    const updatedPref = await tx.appPreference.upsert({
      where: { id: "default" },
      update: { kostName },
      create: {
        id: "default",
        kostName,
        currencyCode: "IDR",
        timezone: JAKARTA_TIMEZONE,
        dateFormat: "dd MMM yyyy",
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "UPDATE_CASH_ACCOUNT_SETTINGS",
        entityType: "CashAccount",
        entityId: updatedAccount.id,
        summary: `Memperbarui pengaturan kas "${kostName}" (${updatedAccount.provider} - ${updatedAccount.name}), pemegang kas: ${custodian.name}`,
      },
    });

    return {
      cashAccount: updatedAccount,
      preference: updatedPref,
      custodianName: custodian.name,
    };
  });
}

/**
 * Bagian B: Menetapkan kebijakan tarif iuran bulanan untuk periode efektif tanpa mengubah tagihan historis.
 */
export async function authorizedUpdateContributionTariffSetting(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = UpdateContributionSettingSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data kebijakan tarif iuran tidak valid."
    );
  }

  // Gunakan alur kebijakan tarif yang sama dengan modul Iuran (kode `POLICY-YYYY-MM`)
  // agar tidak ada dua kebijakan aktif untuk periode efektif yang sama.
  return authorizedUpsertContributionPolicy(db, validActor, parsed.data);
}

/**
 * Bagian C: Mengubah password akun anggota yang sedang login secara aman
 * dengan verifikasi password lama (currentPassword) dan AuditLog tanpa membocorkan hash/password.
 */
export async function authorizedChangeOwnPassword(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<{ updatedAt: Date }> {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = ChangeOwnPasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data perubahan password tidak valid."
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const account = await db.userAccount.findUnique({
    where: { id: validActor.userAccountId },
  });

  if (!account || !account.isActive) {
    throw new Error("Akun pengguna tidak ditemukan atau tidak aktif.");
  }

  const isCurrentValid = await verifyPassword(
    currentPassword,
    account.passwordHash
  );
  if (!isCurrentValid) {
    throw new Error("Password lama yang dimasukkan tidak sesuai.");
  }

  const newPasswordHash = await hashPassword(newPassword);

  return db.$transaction(async (tx) => {
    const updated = await tx.userAccount.update({
      where: { id: account.id },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    // Keamanan: Revoke seluruh sesi aktif lainnya milik akun ini saat password diubah
    const now = new Date();
    await tx.authSession.updateMany({
      where: {
        userAccountId: account.id,
        id: { not: validActor.sessionId },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "CHANGE_PASSWORD",
        entityType: "UserAccount",
        entityId: account.id,
        summary: `Anggota ${validActor.memberName} (@${validActor.username}) memperbarui password akun secara terverifikasi dan mencabut seluruh sesi aktif lainnya`,
      },
    });

    return { updatedAt: updated.updatedAt };
  });
}

/**
 * Bagian C: Mengakhiri seluruh sesi login aktif lainnya milik anggota yang sedang login.
 */
export async function authorizedRevokeOtherActiveSessions(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined
): Promise<{ revokedCount: number }> {
  const validActor = await verifyActiveActorInDb(db, actor);

  return db.$transaction(async (tx) => {
    const now = new Date();
    const res = await tx.authSession.updateMany({
      where: {
        userAccountId: validActor.userAccountId,
        id: { not: validActor.sessionId },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "REVOKE_OTHER_SESSIONS",
        entityType: "UserAccount",
        entityId: validActor.userAccountId,
        summary: `Mengakhiri ${res.count} sesi login lain untuk akun @${validActor.username}`,
      },
    });

    return { revokedCount: res.count };
  });
}

/**
 * Bagian D: Memperbarui preferensi tampilan & format aplikasi dengan jejak audit.
 */
export async function authorizedUpdateAppPreferences(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = UpdateAppPreferencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Preferensi aplikasi tidak valid."
    );
  }

  return db.$transaction(async (tx) => {
    const pref = await tx.appPreference.upsert({
      where: { id: "default" },
      update: {
        kostName: parsed.data.kostName,
        dateFormat: parsed.data.dateFormat,
        currencyCode: "IDR",
        timezone: JAKARTA_TIMEZONE,
      },
      create: {
        id: "default",
        kostName: parsed.data.kostName,
        dateFormat: parsed.data.dateFormat,
        currencyCode: "IDR",
        timezone: JAKARTA_TIMEZONE,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: validActor.memberId,
        actorName: validActor.memberName,
        action: "UPDATE_APP_PREFERENCES",
        entityType: "AppPreference",
        entityId: pref.id,
        summary: `Memperbarui preferensi aplikasi (${pref.kostName}, format tanggal: ${pref.dateFormat}, mata uang: ${pref.currencyCode}, zona waktu: ${pref.timezone})`,
      },
    });

    return pref;
  });
}

/**
 * Bagian 7 (Cash Reconciliation): Mencatat koreksi saldo kas melalui CashMovement ADJUSTMENT
 * dengan alasan wajib dan AuditLog, tanpa mengubah atau menghapus histori transaksi sebelumnya.
 */
export async function authorizedRecordReconciliationAdjustment(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = await verifyActiveActorInDb(db, actor);
  const parsed = RecordReconciliationAdjustmentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data koreksi saldo kas tidak valid."
    );
  }

  const cashAccount = parsed.data.cashAccountId
    ? await db.cashAccount.findUnique({
        where: { id: parsed.data.cashAccountId },
      })
    : await db.cashAccount.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });

  if (!cashAccount) {
    throw new Error("Akun kas operasional DANA belum tersedia.");
  }

  if (parsed.data.direction === "OUT") {
    const ledger = await getCashLedgerSummary(db, cashAccount.id);
    if (ledger.actualBalance < parsed.data.amount) {
      throw new Error(
        `Saldo kas tercatat (Rp${ledger.actualBalance.toLocaleString("id-ID")}) tidak mencukupi untuk penyesuaian keluar Rp${parsed.data.amount.toLocaleString("id-ID")}.`
      );
    }
  }

  return recordLedgerEntry(db, {
    cashAccountId: cashAccount.id,
    direction: parsed.data.direction,
    category: "ADJUSTMENT",
    amount: parsed.data.amount,
    description: `Rekonsiliasi Kas: ${parsed.data.reason}`,
    idempotencyKey: parsed.data.idempotencyKey,
    status: "CONFIRMED",
    actorMemberId: validActor.memberId,
  });
}

export interface SafeAuditLogItem {
  id: string;
  createdAt: Date;
  timestampLabel: string;
  actorName: string;
  action: string;
  actionCategory: "FINANCE" | "BUDGET" | "SETTINGS" | "AUTH";
  entityType: string;
  summary: string;
}

function classifyAuditAction(
  action: string,
  entityType: string
): SafeAuditLogItem["actionCategory"] {
  if (
    entityType === "MonthlyBudget" ||
    entityType === "MonthlyBudgetAllocation" ||
    action.includes("BUDGET")
  ) {
    return "BUDGET";
  }
  if (
    entityType === "AuthSession" ||
    entityType === "UserAccount" ||
    action.includes("LOGIN") ||
    action.includes("LOGOUT") ||
    action.includes("PASSWORD") ||
    action.includes("SESSION")
  ) {
    return "AUTH";
  }
  if (
    entityType === "AppPreference" ||
    entityType === "ContributionPolicy" ||
    action.includes("SETTINGS") ||
    action.includes("PREFERENCES") ||
    action.includes("POLICY") ||
    action.includes("MEMBER") ||
    action.includes("CATEGORY")
  ) {
    return "SETTINGS";
  }
  return "FINANCE";
}

function sanitizeAuditSummary(rawSummary: string): string {
  // Pastikan tidak pernah membocorkan hash bcrypt ($2a$/$2b$) atau token JWT (eyJ...)
  return rawSummary
    .replace(/\$2[abxy]\$\d+\$[./A-Za-z0-9]{53}/g, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
}

export interface SettingsPageData {
  preferences: {
    kostName: string;
    currencyCode: string;
    timezone: string;
    dateFormat: string;
  };
  cashAccount: {
    id: string;
    code: string;
    name: string;
    provider: string;
    custodianMemberId: string | null;
    custodianName: string;
    recordedLedgerBalance: number;
    confirmedInflowTotal: number;
    confirmedOutflowTotal: number;
    confirmedMovementCount: number;
  };
  contributionSettings: {
    currentPeriod: string;
    nextPeriod: string;
    policies: Array<{
      id: string;
      code: string;
      name: string;
      amountPerMember: number;
      effectiveFromPeriod: string;
      effectiveFromLabel: string;
      effectiveToPeriod: string | null;
      effectiveToLabel: string;
      isActive: boolean;
    }>;
  };
  currentAccount: {
    memberId: string;
    memberName: string;
    username: string;
    joinedAtLabel: string;
    lastLoginAtLabel: string;
    activeSessionCount: number;
    otherActiveSessionCount: number;
  };
  activeMembers: Array<{ id: string; name: string }>;
  auditLogs: {
    filters: {
      period: string;
      actorMemberId: string;
      actionCategory: string;
      page: number;
      pageSize: number;
    };
    pagination: {
      page: number;
      pageSize: number;
      totalCount: number;
      totalPages: number;
      hasPrevPage: boolean;
      hasNextPage: boolean;
    };
    availablePeriods: Array<{ value: string; label: string }>;
    items: SafeAuditLogItem[];
  };
}

/**
 * Mengambil seluruh data halaman Pengaturan Aplikasi (/pengaturan), Rekonsiliasi Kas, dan Riwayat Aktivitas (AuditLog).
 */
export async function getSettingsPageData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawAuditFilters?: {
    period?: string;
    actorMemberId?: string;
    actionCategory?: string;
    page?: number | string;
    pageSize?: number | string;
  }
): Promise<SettingsPageData> {
  const validActor = await verifyActiveActorInDb(db, actor);

  const currentPeriod = getCurrentYearMonthPeriod();
  const nextPeriod = shiftYearMonthPeriod(currentPeriod, 1);

  const auditPeriod =
    rawAuditFilters?.period &&
    (rawAuditFilters.period === "ALL" ||
      ReportPeriodSchema.safeParse(rawAuditFilters.period).success)
      ? rawAuditFilters.period
      : "ALL";
  const auditActorMemberId = rawAuditFilters?.actorMemberId?.trim() || "ALL";
  const auditActionCategory =
    rawAuditFilters?.actionCategory &&
    ["ALL", "FINANCE", "BUDGET", "SETTINGS", "AUTH"].includes(
      rawAuditFilters.actionCategory
    )
      ? rawAuditFilters.actionCategory
      : "ALL";

  const requestedPage = Math.max(1, Number(rawAuditFilters?.page) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(rawAuditFilters?.pageSize) || 50)
  );

  let auditDateRange: { gte: Date; lt: Date } | undefined;
  if (auditPeriod !== "ALL") {
    const { startUtc, endUtc } = getJakartaPeriodBounds(auditPeriod);
    auditDateRange = { gte: startUtc, lt: endUtc };
  }

  // Bangun klausa filter database untuk audit log
  const auditWhereClause: Record<string, unknown> = {
    ...(auditDateRange ? { createdAt: auditDateRange } : {}),
    ...(auditActorMemberId !== "ALL"
      ? { actorMemberId: auditActorMemberId }
      : {}),
  };

  if (auditActionCategory === "BUDGET") {
    auditWhereClause.OR = [
      { entityType: { in: ["MonthlyBudget", "MonthlyBudgetAllocation"] } },
      { action: { contains: "BUDGET" } },
    ];
  } else if (auditActionCategory === "AUTH") {
    auditWhereClause.OR = [
      { entityType: { in: ["AuthSession", "UserAccount"] } },
      { action: { contains: "LOGIN" } },
      { action: { contains: "LOGOUT" } },
      { action: { contains: "PASSWORD" } },
      { action: { contains: "SESSION" } },
    ];
  } else if (auditActionCategory === "SETTINGS") {
    auditWhereClause.OR = [
      {
        entityType: {
          in: ["AppPreference", "ContributionPolicy", "ExpenseCategory", "Member"],
        },
      },
      { action: { contains: "SETTINGS" } },
      { action: { contains: "PREFERENCES" } },
      { action: { contains: "POLICY" } },
      { action: { contains: "MEMBER" } },
      { action: { contains: "CATEGORY" } },
    ];
  } else if (auditActionCategory === "FINANCE") {
    auditWhereClause.OR = [
      {
        entityType: {
          in: [
            "Expense",
            "Payment",
            "PaymentAllocation",
            "Reimbursement",
            "ReimbursementPayout",
            "CashMovement",
            "CashAccount",
          ],
        },
      },
      { action: { contains: "EXPENSE" } },
      { action: { contains: "PAYMENT" } },
      { action: { contains: "REIMBURSE" } },
      { action: { contains: "LEDGER" } },
      { action: { contains: "ADJUSTMENT" } },
    ];
  }

  const now = new Date();

  const [
    appPref,
    cashAccount,
    policies,
    userAccount,
    activeSessionCount,
    activeMembers,
    totalAuditCount,
    rawAuditLogs,
  ] = await Promise.all([
    db.appPreference.findUnique({ where: { id: "default" } }),
    db.cashAccount.findFirst({
      where: { isActive: true },
      include: { custodianMember: true },
      orderBy: { createdAt: "asc" },
    }),
    db.contributionPolicy.findMany({
      orderBy: [{ effectiveFromPeriod: "desc" }, { createdAt: "desc" }],
    }),
    db.userAccount.findUnique({
      where: { id: validActor.userAccountId },
      include: { member: true },
    }),
    db.authSession.count({
      where: {
        userAccountId: validActor.userAccountId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    db.member.findMany({
      where: { leftAt: null },
      select: { id: true, name: true },
      orderBy: [{ joinedAt: "asc" }, { name: "asc" }],
    }),
    db.auditLog.count({ where: auditWhereClause }),
    db.auditLog.findMany({
      where: auditWhereClause,
      include: {
        actorMember: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (requestedPage - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalAuditCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  if (!cashAccount) {
    throw new Error("Akun kas operasional DANA belum tersedia.");
  }

  const ledgerSummary = await getCashLedgerSummary(db, cashAccount.id);

  const mappedAuditItems: SafeAuditLogItem[] = rawAuditLogs
    .map((log) => {
      const actionCategory = classifyAuditAction(log.action, log.entityType);
      return {
        id: log.id,
        createdAt: log.createdAt,
        timestampLabel: formatJakartaDate(log.createdAt, true),
        actorName: log.actorMember?.name ?? log.actorName ?? "Sistem",
        action: log.action,
        actionCategory,
        entityType: log.entityType,
        summary: sanitizeAuditSummary(log.summary),
      };
    })
    .filter((item) =>
      auditActionCategory === "ALL"
        ? true
        : item.actionCategory === auditActionCategory
    );

  const availablePeriods = [
    { value: "ALL", label: "Semua Periode" },
    ...[
      shiftYearMonthPeriod(currentPeriod, 1),
      currentPeriod,
      shiftYearMonthPeriod(currentPeriod, -1),
      shiftYearMonthPeriod(currentPeriod, -2),
    ].map((p) => ({ value: p, label: formatPeriodLabel(p) })),
  ];

  return {
    preferences: {
      kostName: appPref?.kostName ?? "KostKas Bersama",
      currencyCode: appPref?.currencyCode ?? "IDR",
      timezone: appPref?.timezone ?? JAKARTA_TIMEZONE,
      dateFormat: appPref?.dateFormat ?? "dd MMM yyyy",
    },
    cashAccount: {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      provider: cashAccount.provider,
      custodianMemberId: cashAccount.custodianMemberId,
      custodianName: cashAccount.custodianMember?.name ?? "Farhan",
      recordedLedgerBalance: ledgerSummary.actualBalance,
      confirmedInflowTotal: ledgerSummary.confirmedInflowTotal,
      confirmedOutflowTotal: ledgerSummary.confirmedOutflowTotal,
      confirmedMovementCount: ledgerSummary.confirmedMovementCount,
    },
    contributionSettings: {
      currentPeriod,
      nextPeriod,
      policies: policies.map((pol) => ({
        id: pol.id,
        code: pol.code,
        name: pol.name,
        amountPerMember: pol.amountPerMember,
        effectiveFromPeriod: pol.effectiveFromPeriod,
        effectiveFromLabel: formatPeriodLabel(pol.effectiveFromPeriod),
        effectiveToPeriod: pol.effectiveToPeriod,
        effectiveToLabel: pol.effectiveToPeriod
          ? formatPeriodLabel(pol.effectiveToPeriod)
          : "Berlaku seterusnya",
        isActive: pol.isActive,
      })),
    },
    currentAccount: {
      memberId: validActor.memberId,
      memberName: userAccount?.member.name ?? validActor.memberName,
      username: userAccount?.username ?? validActor.username,
      joinedAtLabel: userAccount?.member.joinedAt
        ? formatJakartaDate(userAccount.member.joinedAt)
        : "-",
      lastLoginAtLabel: userAccount?.lastLoginAt
        ? formatJakartaDate(userAccount.lastLoginAt, true)
        : "Baru saja",
      activeSessionCount,
      otherActiveSessionCount: Math.max(0, activeSessionCount - 1),
    },
    activeMembers,
    auditLogs: {
      filters: {
        period: auditPeriod,
        actorMemberId: auditActorMemberId,
        actionCategory: auditActionCategory,
        page: currentPage,
        pageSize,
      },
      pagination: {
        page: currentPage,
        pageSize,
        totalCount: totalAuditCount,
        totalPages,
        hasPrevPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
      },
      availablePeriods,
      items: mappedAuditItems,
    },
  };
}
