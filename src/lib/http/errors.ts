/** A domain error for a resource that no longer exists. */
export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

/** A domain error for a request that conflicts with existing data. */
export class ResourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceConflictError";
  }
}
