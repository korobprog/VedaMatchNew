-- CreateEnum
CREATE TYPE "public"."MarketOrderStatus" AS ENUM ('new_request', 'accepted', 'in_progress', 'completed', 'declined_by_seller', 'cancelled_by_buyer');

-- AlterTable

-- CreateTable
CREATE TABLE "public"."MarketCartItem" (
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCartItem_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "public"."MarketOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "buyerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "public"."MarketOrderStatus" NOT NULL DEFAULT 'new_request',
    "totalMinor" INTEGER NOT NULL,
    "currency" "public"."MarketCurrency" NOT NULL,
    "deliveryOption" "public"."MarketDeliveryOption",
    "deliveryNote" TEXT,
    "buyerComment" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" "public"."MarketCurrency" NOT NULL,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotalMinor" INTEGER NOT NULL,

    CONSTRAINT "MarketOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketConversation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT,
    "orderId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketCartItem_listingId_idx" ON "public"."MarketCartItem"("listingId");

-- CreateIndex
CREATE INDEX "MarketCartItem_userId_createdAt_idx" ON "public"."MarketCartItem"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_number_key" ON "public"."MarketOrder"("number");

-- CreateIndex
CREATE INDEX "MarketOrder_buyerId_createdAt_idx" ON "public"."MarketOrder"("buyerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketOrder_shopId_status_createdAt_idx" ON "public"."MarketOrder"("shopId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketOrderItem_orderId_idx" ON "public"."MarketOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "MarketOrderItem_listingId_idx" ON "public"."MarketOrderItem"("listingId");

-- CreateIndex
CREATE INDEX "MarketConversation_buyerId_lastMessageAt_idx" ON "public"."MarketConversation"("buyerId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "MarketConversation_shopId_lastMessageAt_idx" ON "public"."MarketConversation"("shopId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketConversation_shopId_buyerId_key" ON "public"."MarketConversation"("shopId", "buyerId");

-- CreateIndex
CREATE INDEX "MarketMessage_conversationId_createdAt_idx" ON "public"."MarketMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketMessage_conversationId_readAt_idx" ON "public"."MarketMessage"("conversationId", "readAt");

-- CreateIndex
CREATE INDEX "MarketMessage_fromUserId_idx" ON "public"."MarketMessage"("fromUserId");

-- AddForeignKey
ALTER TABLE "public"."MarketCartItem" ADD CONSTRAINT "MarketCartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketCartItem" ADD CONSTRAINT "MarketCartItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketOrder" ADD CONSTRAINT "MarketOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketOrder" ADD CONSTRAINT "MarketOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketConversation" ADD CONSTRAINT "MarketConversation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketConversation" ADD CONSTRAINT "MarketConversation_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketConversation" ADD CONSTRAINT "MarketConversation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketConversation" ADD CONSTRAINT "MarketConversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."MarketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketMessage" ADD CONSTRAINT "MarketMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."MarketConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketMessage" ADD CONSTRAINT "MarketMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
