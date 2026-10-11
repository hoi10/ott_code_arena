CREATE TABLE `FriendRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `senderId` INTEGER NOT NULL,
    `receiverId` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FriendRequest_senderId_receiverId_key`(`senderId`, `receiverId`),
    INDEX `FriendRequest_receiverId_status_createdAt_idx`(`receiverId`, `status`, `createdAt`),
    INDEX `FriendRequest_senderId_status_createdAt_idx`(`senderId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserPresence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `sessionId` CHAR(36) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserPresence_userId_sessionId_key`(`userId`, `sessionId`),
    INDEX `UserPresence_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SocialInvitation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `senderId` INTEGER NOT NULL,
    `receiverId` INTEGER NOT NULL,
    `roomId` INTEGER NULL,
    `kind` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SocialInvitation_receiverId_status_expiresAt_idx`(`receiverId`, `status`, `expiresAt`),
    INDEX `SocialInvitation_senderId_status_expiresAt_idx`(`senderId`, `status`, `expiresAt`),
    INDEX `SocialInvitation_roomId_kind_status_idx`(`roomId`, `kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FriendRequest`
    ADD CONSTRAINT `FriendRequest_senderId_fkey`
    FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `FriendRequest_receiverId_fkey`
    FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserPresence`
    ADD CONSTRAINT `UserPresence_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `SocialInvitation`
    ADD CONSTRAINT `SocialInvitation_senderId_fkey`
    FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `SocialInvitation_receiverId_fkey`
    FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `SocialInvitation_roomId_fkey`
    FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
