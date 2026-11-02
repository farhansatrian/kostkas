import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exportFinancialReportCsv } from "@/lib/reporting-service";
import { getCurrentActor } from "@/lib/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await getCurrentActor();
  if (!actor) {
    return NextResponse.json(
      { error: "Akses ditolak: silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") ?? undefined;
  const type = searchParams.get("type") ?? "summary";

  try {
    const exported = await exportFinancialReportCsv(prisma, actor, {
      period,
      type,
    });

    const utf8WithBom = `\uFEFF${exported.csvContent}`;

    return new NextResponse(utf8WithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Gagal mengekspor laporan CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

