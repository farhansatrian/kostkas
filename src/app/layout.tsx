import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KostKas — Ringkasan Kas",
  description:
    "Sistem pengelolaan uang kas bersama penghuni kost: iuran bulanan, pengeluaran operasional, dan reimbursement.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-[#F8FAFA] text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
