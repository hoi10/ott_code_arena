CREATE TABLE `RoomPresence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `sessionId` CHAR(36) NOT NULL,
    `userId` INTEGER NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RoomPresence_roomId_sessionId_key`(`roomId`, `sessionId`),
    INDEX `RoomPresence_roomId_lastSeenAt_idx`(`roomId`, `lastSeenAt`),
    INDEX `RoomPresence_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RoomPresence`
    ADD CONSTRAINT `RoomPresence_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
