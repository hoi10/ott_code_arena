const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const bcrypt = require("bcrypt");

const repositoryPath = require.resolve("../src/repositories/user.repository");
const databasePath = require.resolve("../src/config/database");
const botRepositoryPath = require.resolve("../src/repositories/bot.repository");
const submissionRepositoryPath = require.resolve("../src/repositories/submission.repository");
const botServicePath = require.resolve("../src/services/bot.service");
const userServicePath = require.resolve("../src/services/user.service");
const submissionServicePath = require.resolve("../src/services/submission.service");
const originalCache = new Map(
  [
    repositoryPath,
    databasePath,
    botRepositoryPath,
    submissionRepositoryPath,
    botServicePath,
    userServicePath,
    submissionServicePath,
  ].map((filePath) => [filePath, require.cache[filePath]])
);

let userRecord;
let storedSubmission;
let botForSubmission;
let evaluation;
let executionError;
const userRepository = {
  async findById() {
    return userRecord;
  },
  async findByUsername(username) {
    return username === userRecord.username ? userRecord : null;
  },
  async update(id, data) {
    userRecord = { ...userRecord, ...data };
    return userRecord;
  },
  async countBotsByUserId() {
    return 2;
  },
};
const prisma = {
  submission: { async count() { return 3; } },
  match: { async count() { return 4; } },
};
const botRepository = {
  async findByIdAndUserId() {
    return botForSubmission;
  },
};
const submissionRepository = {
  async create(data) {
    storedSubmission = { id: 17, ...data };
    return storedSubmission;
  },
  async updateResult(id, data) {
    assert.equal(id, 17);
    storedSubmission = { ...storedSubmission, ...data };
    return storedSubmission;
  },
};
const botService = {
  async testBot() {
    if (executionError) throw executionError;
    return evaluation;
  },
};

function installMock(filePath, exports) {
  const entry = new Module(filePath);
  entry.filename = filePath;
  entry.loaded = true;
  entry.exports = exports;
  require.cache[filePath] = entry;
}

installMock(repositoryPath, userRepository);
installMock(databasePath, prisma);
installMock(botRepositoryPath, botRepository);
installMock(submissionRepositoryPath, submissionRepository);
installMock(botServicePath, botService);
delete require.cache[userServicePath];
delete require.cache[submissionServicePath];
const userService = require(userServicePath);
const submissionService = require(submissionServicePath);

test.beforeEach(async () => {
  userRecord = {
    id: 9,
    username: "player",
    email: "player@example.com",
    password: await bcrypt.hash("current-pass-1", 4),
  };
  storedSubmission = null;
  botForSubmission = {
    id: 4,
    isActive: true,
    sourceCode: "return input.legalMoves[0];",
    language: "javascript",
  };
  evaluation = {
    valid: true,
    reason: null,
    action: { pieceId: "piece-1", to: { x: 1, y: 2, name: "B3" } },
  };
  executionError = null;
});

test("profile reads and updates never return the stored password hash", async () => {
  const profile = await userService.getProfile(9);
  assert.equal(profile.password, undefined);

  const updated = await userService.updateProfile(9, { username: "new_player" });
  assert.equal(updated.username, "new_player");
  assert.equal(updated.password, undefined);
});

test("password changes require the current password and store a new hash", async () => {
  const oldHash = userRecord.password;
  await assert.rejects(
    () => userService.changePassword(9, {
      currentPassword: "incorrect-pass",
      newPassword: "new-password-1",
    }),
    { message: "CURRENT_PASSWORD_INCORRECT" }
  );
  assert.equal(userRecord.password, oldHash);

  await userService.changePassword(9, {
    currentPassword: "current-pass-1",
    newPassword: "new-password-1",
  });
  assert.notEqual(userRecord.password, oldHash);
  assert.equal(await bcrypt.compare("new-password-1", userRecord.password), true);
});

test("submission records the evaluated legal move as accepted", async () => {
  const submission = await submissionService.createSubmission(9, { botId: 4 });

  assert.equal(submission.status, "accepted");
  assert.equal(submission.botId, 4);
  assert.equal(submission.result.valid, true);
  assert.equal(submission.sourceCode, botForSubmission.sourceCode);
});

test("submission records invalid moves and execution errors explicitly", async () => {
  evaluation = { valid: false, reason: "ILLEGAL_MOVE", action: null };
  const rejected = await submissionService.createSubmission(9, {
    sourceCode: "return null;",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.result.reason, "ILLEGAL_MOVE");

  executionError = new Error("BOT_EXECUTION_TIMEOUT");
  const failed = await submissionService.createSubmission(9, {
    sourceCode: "while (true) {}",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.result.error, "BOT_EXECUTION_TIMEOUT");
});

test.after(() => {
  for (const [filePath, entry] of originalCache) {
    if (entry) require.cache[filePath] = entry;
    else delete require.cache[filePath];
  }
});
