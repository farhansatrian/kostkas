import fs from "node:fs";
import path from "node:path";

const cssDir = path.join(process.cwd(), ".next", "static", "css");

if (!fs.existsSync(cssDir)) {
  console.error(
    "❌ [CSS Verification Failed] Direktori .next/static/css tidak ditemukan."
  );
  process.exit(1);
}

const cssFiles = fs
  .readdirSync(cssDir)
  .filter((file) => file.endsWith(".css"));

if (cssFiles.length === 0) {
  console.error(
    "❌ [CSS Verification Failed] Tidak ditemukan file CSS di .next/static/css."
  );
  process.exit(1);
}

const requiredPatterns = [
  "bg-teal-700",
  "text-slate-900",
  "flex",
  "rounded-",
  "border-",
];

let allPassed = true;
let totalCssSize = 0;

for (const file of cssFiles) {
  const filePath = path.join(cssDir, file);
  const content = fs.readFileSync(filePath, "utf8");
  totalCssSize += content.length;

  // Cek kegagalan umum Tailwind v4 di mana directive utilities tidak diekspansi
  if (content.includes("@tailwind utilities")) {
    console.error(
      `❌ [CSS Verification Failed] File ${file} masih memuat literal '@tailwind utilities' yang belum ter-compile!`
    );
    allPassed = false;
  }
}

for (const pattern of requiredPatterns) {
  const found = cssFiles.some((file) => {
    const content = fs.readFileSync(path.join(cssDir, file), "utf8");
    return content.includes(pattern);
  });

  if (!found) {
    console.error(
      `❌ [CSS Verification Failed] Pola utility wajib '${pattern}' TIDAK ditemukan di file CSS terkompilasi.`
    );
    allPassed = false;
  }
}

if (totalCssSize < 25000) {
  console.error(
    `❌ [CSS Verification Failed] Ukuran total CSS terlalu kecil (${totalCssSize} bytes). Utility classes Tailwind v4 belum ter-generate.`
  );
  allPassed = false;
}

if (!allPassed) {
  process.exit(1);
}

console.log(
  `✅ [CSS Verification Passed] CSS production berhasil memuat utility classes Tailwind v4 (${cssFiles.length} berkas, total ${totalCssSize} bytes).`
);

