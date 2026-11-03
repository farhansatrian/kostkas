/**
 * Helper pemformatan tanggal yang menghormati preferensi pengguna (AppPreference.dateFormat)
 * serta beroperasi secara deterministik pada zona waktu Asia/Jakarta (WIB).
 */
export function formatAppDate(
  date: Date | string | number,
  dateFormatPreference = "dd MMM yyyy",
  includeTime = false
): string {
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "-";

  const isShortMonth = dateFormatPreference === "dd MMM yyyy";

  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: isShortMonth ? "short" : "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }
      : {}),
  }).formatToParts(d);

  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";

  let datePart = `${day} ${month} ${year}`;
  if (dateFormatPreference === "dd/MM/yyyy") {
    datePart = `${day}/${month}/${year}`;
  } else if (dateFormatPreference === "yyyy-MM-dd") {
    datePart = `${year}-${month}-${day}`;
  }

  if (includeTime) {
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const second = parts.find((p) => p.type === "second")?.value ?? "00";
    return `${datePart} ${hour}:${minute}:${second} WIB`;
  }

  return datePart;
}

/**
 * Mengembalikan string tanggal hari ini dalam format YYYY-MM-DD
 * berbasis zona waktu Asia/Jakarta (WIB).
 * Mencegah kesalahan tanggal mundur ke hari sebelumnya akibat pergeseran UTC.
 */
export function getJakartaTodayIso(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}


