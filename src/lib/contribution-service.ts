import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { assertAuthenticatedActor, type AuthenticatedActor } from "./auth";
import {
  confirmPendingContributionPayment,
  createAdditionalPeriodCharges,
  generateRegularPeriodCharges,
  getEffectiveContributionPolicy,
  getPeriodObligationSummary,
  type PaymentProcessResult,
  type PeriodChargesResult,
  recordContributionPayment,
  upsertContributionPolicy,
} from "./financial-service";

const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const PeriodSchema = z
  .string()
  .trim()
  .regex(PERIOD_REGEX, "Format periode harus YYYY-MM (contoh: 2026-11).");

export const GenerateRegularChargesInputSchema = z.object({
  period: PeriodSchema,
});

export const CreateAdditionalChargesInputSchema = z.object({
  period: PeriodSchema,
  title: z
    .string()
    .trim()
    .min(3, "Judul tagihan tambahan minimal 3 karakter.")
    .max(100, "Judul tagihan tambahan maksimal 100 karakter."),
  amountPerMember: z.coerce
    .number()
    .int("Nominal per anggota harus bilangan bulat.")
    .positive("Nominal per anggota harus lebih dari Rp0.")
    .max(50_000_000, "Nominal terlalu besar."),
  batchIdempotencyKey: z
    .string()
    .trim()
    .min(6, "Idempotency key tidak valid."),
});

export const UpsertFuturePolicyInputSchema = z.object({
  effectiveFromPeriod: PeriodSchema,
  name: z
    .string()
    .trim()
    .min(3, "Nama kebijakan minimal 3 karakter.")
    .max(100, "Nama kebijakan maksimal 100 karakter."),
  amountPerMember: z.coerce
    .number()
    .int("Tarif iuran harus bilangan bulat.")
    .positive("Tarif iuran harus lebih dari Rp0.")
    .max(50_000_000, "Nominal tarif terlalu besar."),
});

export const RecordPaymentInputSchema = z.object({
  chargeId: z.string().uuid("Pilih tagihan yang valid."),
  amount: z.coerce
    .number()
    .int("Nominal pembayaran harus bilangan bulat.")
    .positive("Nominal pembayaran harus lebih dari Rp0."),
  confirmImmediately: z.boolean().default(true),
  idempotencyKey: z.string().trim().min(6, "Idempotency key diperlukan."),
  cashAccountId: z.string().uuid().optional(),
  note: z
    .string()
    .trim()
    .max(160, "Catatan maksimal 160 karakter.")
    .optional(),
});

export const ConfirmPendingPaymentInputSchema = z.object({
  paymentId: z.string().uuid("ID pembayaran tidak valid."),
  targetChargeId: z.string().uuid("Pilih tagihan tujuan alokasi yang valid."),
});

/**
 * Mengambil periode berjalan (YYYY-MM) berdasarkan zona waktu Asia/Jakarta,
 * tidak bergantung pada zona waktu server (VM dapat berjalan dalam UTC).
 */
export function getCurrentYearMonthPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function formatPeriodLabel(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${monthNames[monthIndex] ?? monthStr} ${year}`;
}

export function shiftYearMonthPeriod(period: string, deltaMonths: number): string {
  const [yearStr, monthStr] = period.split("-");
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1 + deltaMonths, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Menerbitkan tagihan rutin periode tertentu dengan otorisasi server-side.
 */
export async function authorizedGenerateRegularCharges(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<PeriodChargesResult> {
  const validActor = assertAuthenticatedActor(actor);
  const parsed = GenerateRegularChargesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Periode tidak valid.");
  }

  return generateRegularPeriodCharges(db, {
    period: parsed.data.period,
    title: `Iuran Rutin ${formatPeriodLabel(parsed.data.period)}`,
    actorMemberId: validActor.memberId,
  });
}

/**
 * Menerbitkan tagihan tambahan pada suatu periode tanpa menghapus tagihan rutin awal.
 */
export async function authorizedCreateAdditionalCharges(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<PeriodChargesResult> {
  const validActor = assertAuthenticatedActor(actor);
  const parsed = CreateAdditionalChargesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data tagihan tambahan tidak valid."
    );
  }

  return createAdditionalPeriodCharges(db, {
    period: parsed.data.period,
    title: parsed.data.title,
    amountPerMember: parsed.data.amountPerMember,
    batchIdempotencyKey: parsed.data.batchIdempotencyKey,
    actorMemberId: validActor.memberId,
  });
}

/**
 * Menetapkan kebijakan tarif baru untuk periode mendatang tanpa mengubah tagihan periode sebelumnya.
 */
export async function authorizedUpsertContributionPolicy(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
) {
  const validActor = assertAuthenticatedActor(actor);
  const parsed = UpsertFuturePolicyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data kebijakan tarif tidak valid."
    );
  }

  const { effectiveFromPeriod, name, amountPerMember } = parsed.data;

  // Cari kebijakan sebelumnya yang masih terbuka (effectiveToPeriod: null) dan efektif sebelum periode baru
  const previousOpenPolicy = await db.contributionPolicy.findFirst({
    where: {
      isActive: true,
      effectiveToPeriod: null,
      effectiveFromPeriod: { lt: effectiveFromPeriod },
    },
    orderBy: { effectiveFromPeriod: "desc" },
  });

  const code = `POLICY-${effectiveFromPeriod}`;

  return upsertContributionPolicy(db, {
    code,
    name,
    amountPerMember,
    effectiveFromPeriod,
    effectiveToPeriod: null,
    closePreviousPolicyCode: previousOpenPolicy?.code,
    actorMemberId: validActor.memberId,
  });
}

/**
 * Mencatat pembayaran iuran (penuh atau parsial) dengan validasi dan otorisasi server-side.
 */
export async function authorizedRecordContributionPayment(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<PaymentProcessResult> {
  const validActor = assertAuthenticatedActor(actor);
  const parsed = RecordPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data pembayaran tidak valid."
    );
  }

  const {
    chargeId,
    amount,
    confirmImmediately,
    idempotencyKey,
    cashAccountId,
    note,
  } = parsed.data;

  const [charge, existingByKey] = await Promise.all([
    db.contributionCharge.findUnique({
      where: { id: chargeId },
      include: { member: true },
    }),
    db.payment.findUnique({
      where: { idempotencyKey },
      select: { id: true, cashAccountId: true },
    }),
  ]);

  if (!charge || charge.status === "CANCELLED") {
    throw new Error("Tagihan iuran yang dipilih tidak ditemukan atau dibatalkan.");
  }

  if (!existingByKey) {
    const remaining = charge.amount - charge.allocatedAmount;
    if (amount > remaining) {
      throw new Error(
        `Nominal pembayaran (Rp${amount.toLocaleString("id-ID")}) melebihi sisa tagihan ${charge.member.name} (Rp${remaining.toLocaleString("id-ID")}).`
      );
    }
  }

  const targetCashAccountId =
    cashAccountId ??
    existingByKey?.cashAccountId ??
    (
      await db.cashAccount.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    )?.id;

  if (!targetCashAccountId) {
    throw new Error("Akun kas penyimpanan (DANA) belum tersedia di database.");
  }

  const formattedNote = note
    ? `[CHARGE:${charge.id}] ${note}`
    : `[CHARGE:${charge.id}] Pembayaran ${charge.title} (${charge.member.name})`;

  return recordContributionPayment(db, {
    memberId: charge.memberId,
    cashAccountId: targetCashAccountId,
    amount,
    targetChargeIds: [charge.id],
    idempotencyKey,
    confirmImmediately,
    actorMemberId: validActor.memberId,
    note: formattedNote,
  });
}

/**
 * Mengonfirmasi pembayaran berstatus PENDING secara atomic sehingga memperbarui
 * status tagihan dan menambah CashMovement pada buku besar.
 */
export async function authorizedConfirmPendingPayment(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  rawInput: unknown
): Promise<PaymentProcessResult> {
  const validActor = assertAuthenticatedActor(actor);
  const parsed = ConfirmPendingPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Data konfirmasi pembayaran tidak valid."
    );
  }

  return confirmPendingContributionPayment(db, {
    paymentId: parsed.data.paymentId,
    targetChargeIds: [parsed.data.targetChargeId],
    actorMemberId: validActor.memberId,
  });
}

export function extractTargetChargeIdFromNote(
  note: string | null
): string | null {
  if (!note) return null;
  const match = /^\[CHARGE:([0-9a-fA-F-]{36})\]\s*(.*)$/.exec(note);
  return match ? match[1] : null;
}

export function stripChargePrefixFromNote(note: string | null): string {
  if (!note) return "Pembayaran iuran anggota";
  const match = /^\[CHARGE:[0-9a-fA-F-]{36}\]\s*(.*)$/.exec(note);
  return match && match[1] ? match[1] : note;
}

/**
 * Mengambil seluruh data tampilan halaman Iuran Bulanan (Monthly Contributions) untuk periode tertentu.
 */
export async function getMonthlyContributionsPageData(
  db: PrismaClient,
  actor: AuthenticatedActor | null | undefined,
  requestedPeriod?: string
) {
  assertAuthenticatedActor(actor);

  const defaultPeriod = getCurrentYearMonthPeriod();
  const period =
    requestedPeriod && PERIOD_REGEX.test(requestedPeriod)
      ? requestedPeriod
      : defaultPeriod;

  const [
    effectivePolicy,
    allPolicies,
    obligationSummary,
    activeMembers,
    periodCharges,
    pendingPayments,
    confirmedAllocations,
  ] = await Promise.all([
    getEffectiveContributionPolicy(db, period),
    db.contributionPolicy.findMany({
      where: { isActive: true },
      orderBy: { effectiveFromPeriod: "asc" },
    }),
    getPeriodObligationSummary(db, period),
    db.member.findMany({
      where: { leftAt: null },
      orderBy: { joinedAt: "asc" },
    }),
    db.contributionCharge.findMany({
      where: {
        period,
        status: { not: "CANCELLED" },
      },
      include: {
        member: true,
        allocations: {
          include: {
            payment: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [
        { kind: "asc" },
        { sequence: "asc" },
        { member: { joinedAt: "asc" } },
      ],
    }),
    db.payment.findMany({
      where: { status: "PENDING" },
      include: { member: true },
      orderBy: { paidAt: "desc" },
    }),
    db.paymentAllocation.findMany({
      where: {
        charge: { period },
      },
      include: {
        payment: {
          include: { member: true },
        },
        charge: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  // Susun daftar pilihan periode (1 bulan lalu s/d 3 bulan ke depan + periode kebijakan)
  const periodSet = new Set<string>([
    shiftYearMonthPeriod(defaultPeriod, -1),
    defaultPeriod,
    shiftYearMonthPeriod(defaultPeriod, 1),
    shiftYearMonthPeriod(defaultPeriod, 2),
    period,
  ]);
  for (const p of allPolicies) {
    periodSet.add(p.effectiveFromPeriod);
  }
  const availablePeriods = Array.from(periodSet).sort();

  const openChargesForPeriod = periodCharges
    .filter((c) => c.amount > c.allocatedAmount)
    .map((c) => ({
      id: c.id,
      memberId: c.memberId,
      memberName: c.member.name,
      title: c.title,
      kind: c.kind,
      amount: c.amount,
      allocatedAmount: c.allocatedAmount,
      remainingAmount: c.amount - c.allocatedAmount,
    }));

  const formattedPendingPayments = pendingPayments.map((p) => {
    const linkedChargeId = extractTargetChargeIdFromNote(p.note);
    return {
      id: p.id,
      memberId: p.memberId,
      memberName: p.member.name,
      amount: p.amount,
      paidAt: p.paidAt,
      cleanNote: stripChargePrefixFromNote(p.note),
      linkedChargeId,
    };
  });

  return {
    period,
    periodLabel: formatPeriodLabel(period),
    availablePeriods,
    effectivePolicy,
    allPolicies,
    obligationSummary,
    activeMembersCount: activeMembers.length,
    charges: periodCharges.map((c) => ({
      id: c.id,
      memberId: c.memberId,
      memberName: c.member.name,
      memberActive: c.member.leftAt === null,
      kind: c.kind,
      sequence: c.sequence,
      title: c.title,
      amount: c.amount,
      allocatedAmount: c.allocatedAmount,
      remainingAmount: c.amount - c.allocatedAmount,
      status: c.status,
      updatedAt: c.updatedAt,
    })),
    openChargesForPeriod,
    pendingPayments: formattedPendingPayments,
    recentConfirmedAllocations: confirmedAllocations.map((a) => ({
      id: a.id,
      paymentId: a.paymentId,
      memberName: a.payment.member.name,
      chargeTitle: a.charge.title,
      amount: a.amount,
      confirmedAt: a.payment.confirmedAt ?? a.payment.paidAt,
      note: stripChargePrefixFromNote(a.payment.note),
    })),
  };
}
