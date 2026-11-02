import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type {
  AuthSession,
  Member,
  PrismaClient,
  UserAccount,
} from "../generated/prisma/client";

export const SESSION_COOKIE_NAME = "kostkas_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const BCRYPT_SALT_ROUNDS = 12;

export class UnauthorizedError extends Error {
  constructor(message = "Akses ditolak: sesi autentikasi tidak valid atau sudah berakhir.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface SessionTokenPayload {
  sessionId: string;
  userAccountId: string;
  memberId: string;
  username: string;
  expiresAt: string;
}

export interface AuthenticatedActor {
  sessionId: string;
  userAccountId: string;
  memberId: string;
  username: string;
  memberName: string;
}

export const LoginCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter.")
    .max(50, "Username maksimal 50 karakter.")
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter.")
    .max(128, "Password terlalu panjang."),
});

function getSecretKeyBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Konfigurasi AUTH_SECRET belum diatur atau kurang dari 32 karakter pada environment server."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Meng-hash password menggunakan algoritma bcrypt (cost factor 12).
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (plainPassword.length < 8) {
    throw new Error("Password minimal harus terdiri dari 8 karakter.");
  }
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

/**
 * Memverifikasi password terhadap hash bcrypt yang tersimpan.
 */
export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Menandatangani payload sesi menjadi token JWT terverifikasi menggunakan library `jose` (HS256).
 */
export async function signSessionToken(
  payload: SessionTokenPayload
): Promise<string> {
  return new SignJWT({
    sessionId: payload.sessionId,
    userAccountId: payload.userAccountId,
    memberId: payload.memberId,
    username: payload.username,
    expiresAt: payload.expiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(payload.expiresAt))
    .sign(getSecretKeyBytes());
}

/**
 * Memverifikasi tanda tangan kriptografi dan masa berlaku token sesi menggunakan `jose`.
 */
export async function verifySessionToken(
  token: string | undefined
): Promise<SessionTokenPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKeyBytes(), {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sessionId !== "string" ||
      typeof payload.userAccountId !== "string" ||
      typeof payload.memberId !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.expiresAt !== "string"
    ) {
      return null;
    }

    return {
      sessionId: payload.sessionId,
      userAccountId: payload.userAccountId,
      memberId: payload.memberId,
      username: payload.username,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Memastikan aktor yang memanggil aksi keuangan/anggota telah terautentikasi.
 * Seluruh anggota aktif memiliki hak akses yang setara (tanpa pembedaan role).
 */
export function assertAuthenticatedActor(
  actor: AuthenticatedActor | null | undefined
): AuthenticatedActor {
  if (!actor || !actor.memberId || !actor.sessionId) {
    throw new UnauthorizedError();
  }
  return actor;
}

/**
 * Membuat atau memperbarui akun login (`UserAccount`) yang terhubung 1:1 dengan `Member`.
 */
export async function upsertMemberAccountCredentials(
  db: PrismaClient,
  input: {
    memberId: string;
    username: string;
    plainPassword: string;
    actorMemberId?: string;
  }
): Promise<UserAccount> {
  const normalizedUsername = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
    throw new Error(
      "Username hanya boleh berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung (3-40 karakter)."
    );
  }

  const passwordHash = await hashPassword(input.plainPassword);

  return db.$transaction(async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: input.memberId },
    });

    if (!member) {
      throw new Error("Data anggota tidak ditemukan.");
    }

    const account = await tx.userAccount.upsert({
      where: { memberId: member.id },
      update: {
        username: normalizedUsername,
        passwordHash,
        isActive: member.leftAt === null,
      },
      create: {
        memberId: member.id,
        username: normalizedUsername,
        passwordHash,
        isActive: member.leftAt === null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: input.actorMemberId ?? member.id,
        actorName: member.name,
        action: "UPSERT_USER_ACCOUNT",
        entityType: "UserAccount",
        entityId: account.id,
        summary: `Akun login @${account.username} dihubungkan ke anggota ${member.name}`,
      },
    });

    return account;
  });
}

/**
 * Mengautentikasi kredensial login anggota, mencatat sesi di database (`AuthSession`),
 * serta menghasilkan token sesi yang ditandatangani oleh `jose`.
 */
export async function authenticateMemberCredentials(
  db: PrismaClient,
  rawInput: unknown
): Promise<{
  sessionToken: string;
  expiresAt: Date;
  session: AuthSession;
  userAccount: UserAccount;
  member: Member;
  actor: AuthenticatedActor;
}> {
  const parsed = LoginCredentialsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new UnauthorizedError("Username atau password tidak valid.");
  }

  const { username, password } = parsed.data;

  const account = await db.userAccount.findUnique({
    where: { username },
    include: { member: true },
  });

  if (!account) {
    throw new UnauthorizedError("Username atau password tidak sesuai.");
  }

  const isPasswordValid = await verifyPassword(password, account.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError("Username atau password tidak sesuai.");
  }

  if (!account.isActive || account.member.leftAt !== null) {
    throw new UnauthorizedError(
      "Akun anggota sudah tidak aktif dan tidak dapat mengakses aplikasi."
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const session = await db.$transaction(async (tx) => {
    await tx.userAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: now },
    });

    const createdSession = await tx.authSession.create({
      data: {
        userAccountId: account.id,
        expiresAt,
      },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: account.member.id,
        actorName: account.member.name,
        action: "LOGIN_SUCCESS",
        entityType: "AuthSession",
        entityId: createdSession.id,
        summary: `Anggota ${account.member.name} (@${account.username}) berhasil masuk`,
      },
    });

    return createdSession;
  });

  const sessionToken = await signSessionToken({
    sessionId: session.id,
    userAccountId: account.id,
    memberId: account.member.id,
    username: account.username,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    sessionToken,
    expiresAt,
    session,
    userAccount: account,
    member: account.member,
    actor: {
      sessionId: session.id,
      userAccountId: account.id,
      memberId: account.member.id,
      username: account.username,
      memberName: account.member.name,
    },
  };
}

/**
 * Memvalidasi token sesi terhadap tanda tangan kriptografi `jose` DAN status aktif di PostgreSQL
 * (`AuthSession` belum direvoke/kedaluwarsa, `UserAccount` aktif, dan `Member.leftAt` bernilai null).
 */
export async function validateDatabaseSessionToken(
  db: PrismaClient,
  token: string | undefined
): Promise<AuthenticatedActor | null> {
  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const dbSession = await db.authSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      userAccount: {
        include: {
          member: true,
        },
      },
    },
  });

  if (!dbSession) {
    return null;
  }

  const now = new Date();
  if (
    dbSession.revokedAt !== null ||
    dbSession.expiresAt <= now ||
    !dbSession.userAccount.isActive ||
    dbSession.userAccount.member.leftAt !== null
  ) {
    return null;
  }

  return {
    sessionId: dbSession.id,
    userAccountId: dbSession.userAccount.id,
    memberId: dbSession.userAccount.member.id,
    username: dbSession.userAccount.username,
    memberName: dbSession.userAccount.member.name,
  };
}

/**
 * Mencabut (revoke) sesi di database ketika pengguna melakukan logout.
 */
export async function revokeDatabaseSession(
  db: PrismaClient,
  token: string | undefined
): Promise<void> {
  const payload = await verifySessionToken(token);
  if (!payload) {
    return;
  }

  const existing = await db.authSession.findUnique({
    where: { id: payload.sessionId },
    include: {
      userAccount: {
        include: { member: true },
      },
    },
  });

  if (!existing || existing.revokedAt !== null) {
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.authSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorMemberId: existing.userAccount.member.id,
        actorName: existing.userAccount.member.name,
        action: "LOGOUT",
        entityType: "AuthSession",
        entityId: existing.id,
        summary: `Anggota ${existing.userAccount.member.name} keluar dari sesi`,
      },
    });
  });
}

