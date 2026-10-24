import { schema, table, t, SenderError } from 'spacetimedb/server';

// Phase S0 spike. Proves: live subscription, role check by ctx.sender, atomic revert, server route access.

const actorRole = table(
  { name: 'actor_role' },
  {
    identity: t.identity().primaryKey(),
    role: t.string(),
  }
);

const note = table(
  { name: 'note', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    text: t.string(),
    approved: t.bool(),
    author: t.identity(),
  }
);

const spacetimedb = schema({ actorRole, note });
export default spacetimedb;

const ROLES = ['agent', 'approver', 'controller', 'auditor'];

export const init = spacetimedb.init(_ctx => {});

/** Spike only: the first identity to claim a role holds it. The real module assigns roles from an admin identity. */
export const claimRole = spacetimedb.reducer({ role: t.string() }, (ctx, { role }) => {
  if (!ROLES.includes(role)) throw new SenderError(`Unknown role ${role}`);
  for (const r of ctx.db.actorRole.iter()) {
    if (r.role === role && !r.identity.isEqual(ctx.sender)) throw new SenderError(`Role ${role} is already held`);
  }
  const mine = ctx.db.actorRole.identity.find(ctx.sender);
  if (mine) ctx.db.actorRole.identity.update({ ...mine, role });
  else ctx.db.actorRole.insert({ identity: ctx.sender, role });
});

export const addNote = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  const me = ctx.db.actorRole.identity.find(ctx.sender);
  if (!me || me.role !== 'agent') throw new SenderError('Only the agent can add a note');
  ctx.db.note.insert({ id: 0n, text, approved: false, author: ctx.sender });
});

/** Segregation of duties: the role comes from ctx.sender, never from an argument. */
export const approveNote = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  const me = ctx.db.actorRole.identity.find(ctx.sender);
  if (!me || me.role !== 'approver') throw new SenderError(`Refused: ${me?.role ?? 'unknown'} cannot approve`);
  const row = ctx.db.note.id.find(id);
  if (!row) throw new SenderError('No such note');
  ctx.db.note.id.update({ ...row, approved: true });
});

/** Writes a row, then throws. The whole transaction must revert. */
export const boom = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  ctx.db.note.insert({ id: 0n, text, approved: false, author: ctx.sender });
  throw new SenderError('boom: this write must not survive');
});
