/**
 * Session primitives shared by the HTTP server and focused authorization tests.
 * A caller must supply the application's role map so this module cannot broaden
 * the roles that are allowed to access internal content.
 */
export function activeSessionActor(session, now = Date.now()) {
  if (!session || !session.actor || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
  return session.actor;
}

export function hasEmployeeRole(actor, rolePermissions) {
  return Boolean(actor && Object.hasOwn(rolePermissions, actor.role));
}
