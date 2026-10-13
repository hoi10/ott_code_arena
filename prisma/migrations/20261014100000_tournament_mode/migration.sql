-- CreateTable
CREATE TABLE `Tournament` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `format` VARCHAR(30) NOT NULL DEFAULT 'round_robin',
    `lockedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `hostUserId` INTEGER NOT NULL,

    INDEX `Tournament_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Tournament_hostUserId_status_idx`(`hostUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TournamentEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `seed` INTEGER NOT NULL,
    `snapshotSourceCode` LONGTEXT NOT NULL,
    `snapshotLanguage` VARCHAR(30) NOT NULL DEFAULT 'javascript',
    `snapshotProtocolVersion` INTEGER NOT NULL DEFAULT 2,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tournamentId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `botId` INTEGER NOT NULL,

    UNIQUE INDEX `TournamentEntry_tournamentId_userId_key`(`tournamentId`, `userId`),
    UNIQUE INDEX `TournamentEntry_tournamentId_botId_key`(`tournamentId`, `botId`),
    INDEX `TournamentEntry_tournamentId_seed_idx`(`tournamentId`, `seed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TournamentRound` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roundNumber` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tournamentId` INTEGER NOT NULL,

    UNIQUE INDEX `TournamentRound_tournamentId_roundNumber_key`(`tournamentId`, `roundNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TournamentMatch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tournamentId` INTEGER NOT NULL,
    `roundId` INTEGER NOT NULL,
    `entryAId` INTEGER NOT NULL,
    `entryBId` INTEGER NOT NULL,

    UNIQUE INDEX `TournamentMatch_tournamentId_entryAId_entryBId_key`(`tournamentId`, `entryAId`, `entryBId`),
    INDEX `TournamentMatch_roundId_status_idx`(`roundId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TournamentGame` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `legNumber` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `winnerEntryId` INTEGER NULL,
    `isDraw` BOOLEAN NOT NULL DEFAULT false,
    `winReason` VARCHAR(60) NULL,
    `turns` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `errorCode` VARCHAR(80) NULL,
    `errorMessage` VARCHAR(500) NULL,
    `result` JSON NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `matchId` INTEGER NOT NULL,
    `firstEntryId` INTEGER NOT NULL,
    `secondEntryId` INTEGER NOT NULL,

    UNIQUE INDEX `TournamentGame_matchId_legNumber_key`(`matchId`, `legNumber`),
    INDEX `TournamentGame_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Tournament`
    ADD CONSTRAINT `Tournament_hostUserId_fkey`
    FOREIGN KEY (`hostUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentEntry`
    ADD CONSTRAINT `TournamentEntry_tournamentId_fkey`
    FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentEntry_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentEntry_botId_fkey`
    FOREIGN KEY (`botId`) REFERENCES `Bot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentRound`
    ADD CONSTRAINT `TournamentRound_tournamentId_fkey`
    FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentMatch`
    ADD CONSTRAINT `TournamentMatch_tournamentId_fkey`
    FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentMatch_roundId_fkey`
    FOREIGN KEY (`roundId`) REFERENCES `TournamentRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentMatch_entryAId_fkey`
    FOREIGN KEY (`entryAId`) REFERENCES `TournamentEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentMatch_entryBId_fkey`
    FOREIGN KEY (`entryBId`) REFERENCES `TournamentEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TournamentGame`
    ADD CONSTRAINT `TournamentGame_matchId_fkey`
    FOREIGN KEY (`matchId`) REFERENCES `TournamentMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentGame_firstEntryId_fkey`
    FOREIGN KEY (`firstEntryId`) REFERENCES `TournamentEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentGame_secondEntryId_fkey`
    FOREIGN KEY (`secondEntryId`) REFERENCES `TournamentEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `TournamentGame_winnerEntryId_fkey`
    FOREIGN KEY (`winnerEntryId`) REFERENCES `TournamentEntry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
