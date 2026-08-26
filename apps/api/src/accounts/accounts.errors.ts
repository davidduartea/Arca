export class AccountNotFoundError extends Error {
  constructor(readonly accountId: string) {
    super(`La cuenta ${accountId} no existe`);
    this.name = "AccountNotFoundError";
  }
}
