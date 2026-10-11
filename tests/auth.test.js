const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../src/middlewares/auth.middleware");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects requests without a bearer token", () => {
  const response = createResponse();
  let passed = false;

  authMiddleware(
    { headers: {} },
    response,
    () => {
      passed = true;
    }
  );

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, "Vui lòng đăng nhập để tiếp tục.");
  assert.equal(passed, false);
});

test("attaches the authenticated user before protected bot and match routes", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "auth-middleware-test-secret-with-32-chars";
  const token = jwt.sign({ userId: 42, username: "player" }, process.env.JWT_SECRET);
  const request = { headers: { authorization: `Bearer ${token}` } };
  const response = createResponse();
  let passed = false;

  try {
    authMiddleware(request, response, () => {
      passed = true;
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }

  assert.equal(passed, true);
  assert.deepEqual(request.user, { id: 42, username: "player" });
});
