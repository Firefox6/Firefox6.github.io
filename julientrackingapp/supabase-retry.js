export const JWT_FUTURE_RETRY_DELAYS_MS = Object.freeze([1500, 3000]);

const JWT_FUTURE_MESSAGE = /jwt issued at future/i;

export function toCloudError(error, fallback) {
  const wrapped = new Error(error?.message || fallback, { cause: error });
  for (const field of ["code", "details", "hint", "status"]) {
    if (error?.[field] !== undefined) wrapped[field] = error[field];
  }
  return wrapped;
}

export function isJwtIssuedAtFutureError(error) {
  if (!error) return false;
  if (error.code === "PGRST303") return true;
  if (JWT_FUTURE_MESSAGE.test(String(error.message || ""))) return true;
  return error.cause && error.cause !== error
    ? isJwtIssuedAtFutureError(error.cause)
    : false;
}

export async function withJwtIssuedAtFutureRetry(operation, options = {}) {
  const delaysMs = options.delaysMs || JWT_FUTURE_RETRY_DELAYS_MS;
  const wait = options.wait || waitFor;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isJwtIssuedAtFutureError(error) || attempt >= delaysMs.length) throw error;
      await wait(delaysMs[attempt]);
    }
  }
}

function waitFor(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
