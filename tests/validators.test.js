const test = require("node:test");
const assert = require("node:assert/strict");
const { createBotSchema } = require("../src/validators/bot.validator");
const {
  createMatchSchema,
  listMatchesSchema,
  changeBotSchema,
} = require("../src/validators/match.validator");
const { changePasswordSchema } = require("../src/validators/user.validator");

test("bot creation validation matches the JavaScript bot form", () => {
  const bot = createBotSchema.parse({
    name: "Tactical",
    sourceCode: "return input.legalMoves[0];",
    isPublic: true,
  });
  assert.equal(bot.language, "javascript");
  assert.equal(bot.isPublic, true);
});

test("match routes validate their request bodies and query parameters", () => {
  assert.deepEqual(createMatchSchema.parse({ botIds: [1, 2] }), {
    botIds: [1, 2],
  });
  assert.deepEqual(listMatchesSchema.parse({ page: "2", limit: "5" }), {
    page: 2,
    limit: 5,
  });
  assert.deepEqual(changeBotSchema.parse({ participantId: 4, botId: 9 }), {
    participantId: 4,
    botId: 9,
  });
});

test("rejects duplicate opponents and unsupported bot languages", () => {
  assert.throws(() => createMatchSchema.parse({ botIds: [3, 3] }));
  assert.throws(() =>
    createBotSchema.parse({
      name: "Unsupported",
      sourceCode: "return null;",
      language: "python",
    })
  );
});

test("password changes require a new password distinct from the current one", () => {
  assert.deepEqual(
    changePasswordSchema.parse({
      currentPassword: "current-123",
      newPassword: "different-123",
    }),
    {
      currentPassword: "current-123",
      newPassword: "different-123",
    }
  );
  assert.throws(() =>
    changePasswordSchema.parse({
      currentPassword: "current-123",
      newPassword: "current-123",
    })
  );
  assert.throws(() =>
    changePasswordSchema.parse({
      currentPassword: "current-123",
      newPassword: "short",
    })
  );
});
