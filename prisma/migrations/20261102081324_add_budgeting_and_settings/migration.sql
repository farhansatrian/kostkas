-- CreateTable
CREATE TABLE "MonthlyBudget" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "note" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyBudgetAllocation" (
    "id" UUID NOT NULL,
    "monthlyBudgetId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyBudgetAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppPreference" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "kostName" TEXT NOT NULL DEFAULT 'KostKas Bersama',
    "currencyCode" TEXT NOT NULL DEFAULT 'IDR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd MMM yyyy',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBudget_period_key" ON "MonthlyBudget"("period");

-- CreateIndex
CREATE INDEX "MonthlyBudget_period_idx" ON "MonthlyBudget"("period");

-- CreateIndex
CREATE INDEX "MonthlyBudgetAllocation_categoryId_idx" ON "MonthlyBudgetAllocation"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBudgetAllocation_monthlyBudgetId_categoryId_key" ON "MonthlyBudgetAllocation"("monthlyBudgetId", "categoryId");

-- AddForeignKey
ALTER TABLE "MonthlyBudget" ADD CONSTRAINT "MonthlyBudget_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyBudgetAllocation" ADD CONSTRAINT "MonthlyBudgetAllocation_monthlyBudgetId_fkey" FOREIGN KEY ("monthlyBudgetId") REFERENCES "MonthlyBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyBudgetAllocation" ADD CONSTRAINT "MonthlyBudgetAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
