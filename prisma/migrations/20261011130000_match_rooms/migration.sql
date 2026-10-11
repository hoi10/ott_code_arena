CREATE TABLE `Room` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(80) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
    `status` VARCHAR(20) NOT NULL DEFAULT 'waiting',
    `hostUserId` INTEGER NOT NULL,
    `pausedByUserId` INTEGER NULL,
    `pauseStartedAt` DATETIME(3) NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Room_name_key`(`name`),
    INDEX `Room_visibility_status_createdAt_idx`(`visibility`, `status`, `createdAt`),
    INDEX `Room_hostUserId_status_idx`(`hostUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RoomPlayer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `slot` INTEGER NOT NULL,
    `botId` INTEGER NULL,
    `isReady` BOOLEAN NOT NULL DEFAULT false,
    `pauseUsedMs` INTEGER NOT NULL DEFAULT 0,
    `leftAt` DATETIME(3) NULL,

    UNIQUE INDEX `RoomPlayer_roomId_userId_key`(`roomId`, `userId`),
    UNIQUE INDEX `RoomPlayer_roomId_slot_key`(`roomId`, `slot`),
    INDEX `RoomPlayer_userId_leftAt_idx`(`userId`, `leftAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Match`
    ADD COLUMN `roomId` INTEGER NULL,
    ADD UNIQUE INDEX `Match_roomId_key`(`roomId`);

ALTER TABLE `Room`
    ADD CONSTRAINT `Room_hostUserId_fkey`
    FOREIGN KEY (`hostUserId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RoomPlayer`
    ADD CONSTRAINT `RoomPlayer_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `RoomPlayer_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `RoomPlayer_botId_fkey`
    FOREIGN KEY (`botId`) REFERENCES `Bot`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Match`
    ADD CONSTRAINT `Match_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
