import type { Lacuna } from '../client'
import type { Account } from '../types'

/**
 * `client.account` — who the current credential belongs to.
 */
export class AccountResource {
  constructor(private readonly client: Lacuna) {}

  /**
   * Retrieve the account behind the current API key.
   *
   * Returns the plan, credit balance, rate limits and the credential's scopes.
   * The call is free and consumes no credits, which makes it the right place to
   * point a connection test: it is the only authenticated endpoint in the API
   * that answers 2xx without either needing an existing task id or spending
   * credits.
   *
   * A key on a plan below Pro gets a `PermissionError` rather than a success —
   * the question this answers is "can this credential use the API", not "is
   * this string shaped like a key".
   */
  async retrieve(): Promise<Account> {
    return this.client.request<Account>({
      method: 'GET',
      path: '/me',
    })
  }
}
