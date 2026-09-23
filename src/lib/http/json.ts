/** Error used to distinguish malformed request bodies from server failures. */
export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Nội dung JSON không hợp lệ.");
    this.name = "InvalidJsonBodyError";
  }
}

/**
 * Parse a JSON request body while retaining a typed error for route handlers.
 * Native Request.json() throws a SyntaxError for malformed JSON, which should
 * be reported to callers as a 400 instead of an internal server error.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}
