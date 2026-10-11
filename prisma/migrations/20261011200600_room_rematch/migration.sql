ALTER TABLE `Room`
    ADD COLUMN `rematchStatus` VARCHAR(20) NOT NULL DEFAULT 'none',
    ADD COLUMN `rematchExpiresAt` DATETIME(3) NULL;

ALTER TABLE `RoomPlayer`
    ADD COLUMN `rematchAccepted` BOOLEAN NOT NULL DEFAULT false;
