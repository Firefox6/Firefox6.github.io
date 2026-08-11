import assert from "node:assert/strict";
import test from "node:test";

import {
  isJwtIssuedAtFutureError,
  toCloudError,
  withJwtIssuedAtFutureRetry,
} from "./supabase-retry.js";

test("preserves Supabase error metadata when adding a fallback", () => {
  const original = { code: "PGRST303", details: "details", hint: "hint", status: 401 };
  const wrapped = toCloudError(original, "Cloud request failed");

  assert.equal(wrapped.message, "Cloud request failed");
  assert.equal(wrapped.code, "PGRST303");
  assert.equal(wrapped.details, "details");
  assert.equal(wrapped.hint, "hint");
  assert.equal(wrapped.status, 401);
  assert.equal(wrapped.cause, original);
});

test("recognizes JWT issued at future by PostgREST code or message", () => {
  assert.equal(isJwtIssuedAtFutureError({ code: "PGRST303", message: "JWT verification failed" }), true);
  assert.equal(isJwtIssuedAtFutureError(new Error("JWT issued at future")), true);
  assert.equal(isJwtIssuedAtFutureError(new Error("jwt ISSUED AT FUTURE")), true);
  assert.equal(isJwtIssuedAtFutureError(new Error("Failed", { cause: new Error("JWT issued at future") })), true);
  assert.equal(isJwtIssuedAtFutureError(new Error("Failed to fetch")), false);
});

test("retries the same read operation after the first transient JWT error", async () => {
  let attempts = 0;
  const waits = [];
  const operation = async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error("JWT issued at future"), { code: "PGRST303" });
    return { ok: true };
  };

  const result = await withJwtIssuedAtFutureRetry(operation, {
    delaysMs: [1500, 3000],
    wait: async (delayMs) => waits.push(delayMs),
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1500]);
});

test("stops after the configured JWT retries and preserves the original error", async () => {
  const error = Object.assign(new Error("JWT issued at future"), { code: "PGRST303" });
  let attempts = 0;
  const waits = [];

  await assert.rejects(
    withJwtIssuedAtFutureRetry(
      async () => {
        attempts += 1;
        throw error;
      },
      {
        delaysMs: [1500, 3000],
        wait: async (delayMs) => waits.push(delayMs),
      },
    ),
    (caught) => caught === error,
  );

  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1500, 3000]);
});

test("does not retry unrelated cloud errors", async () => {
  const error = new Error("Failed to fetch");
  let attempts = 0;
  let waits = 0;

  await assert.rejects(
    withJwtIssuedAtFutureRetry(
      async () => {
        attempts += 1;
        throw error;
      },
      { wait: async () => { waits += 1; } },
    ),
    (caught) => caught === error,
  );

  assert.equal(attempts, 1);
  assert.equal(waits, 0);
});
