# Custom Session Auth Notes

## Cookie Session Model

Use a server-side session model:

- Browser receives an opaque session token in a cookie.
- Cookie is `HttpOnly`.
- Cookie uses `SameSite=Lax` or stricter unless a specific cross-site need exists.
- Cookie uses `Secure` when served over HTTPS.
- Server stores only a hash of the session token.
- Server resolves user and roles from PostgreSQL on authenticated requests.

Do not store auth tokens in `localStorage` or `sessionStorage`.

## Token Entropy

Session tokens must be generated using a cryptographically secure random source. Node's `crypto.randomBytes()` generates cryptographically strong pseudorandom data.

Use tokens with enough entropy to resist guessing. The token value must be meaningless and must not encode user id, role, email, or expiry data.

## Token Hashing

Store a hash of the session token in the database. On request:

1. Read raw token from cookie.
2. Hash it using the configured token hash.
3. Look up the hashed token.
4. Verify expiry and revocation state.

For direct secret comparison, Node provides `crypto.timingSafeEqual()`, but surrounding code must also avoid timing leaks.

## Password Hashing

Use argon2id for password hashing. OWASP recommends Argon2id because it balances resistance to side-channel and GPU-based attacks. Work factors should be configurable so they can be tuned for the server hardware.

Never store plaintext passwords. Never use fast hashes like SHA-256 for passwords.

## Session Expiration

Migration defaults:

- Default session: 8 hours.
- Remember me: 30 days.

Implementation rules:

- Store absolute expiry in DB.
- Expired sessions must be invalid server-side.
- Logout must invalidate the session server-side and clear the cookie client-side.
- Consider rotating session token after login and sensitive account changes.

## Session Rotation And Invalidation

Recommended behavior:

- Create a new session token on login.
- Invalidate old token on logout.
- Delete or mark sessions revoked when password changes.
- Prune expired sessions.
- Keep audit metadata such as created time, expires time, revoked time, and user agent when useful.

## LAN HTTP Vs HTTPS

On plain HTTP LAN, the `Secure` cookie flag cannot be used because browsers only send secure cookies over HTTPS. This creates a deployment decision:

- For local development over HTTP, use `HttpOnly` and `SameSite=Lax`, without `Secure`.
- For production-like LAN with HTTPS, enable `Secure`.

If sensitive production data is used on LAN, HTTPS strategy should be decided before rollout.

## References

- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Node crypto docs: https://nodejs.org/api/crypto.html

