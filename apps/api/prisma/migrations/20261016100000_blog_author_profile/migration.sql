-- Личная страница автора Блог-ленты (VED-686): «О себе».
CREATE TABLE "BlogAuthorProfile" (
    "userId" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogAuthorProfile_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "BlogAuthorProfile" ADD CONSTRAINT "BlogAuthorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
