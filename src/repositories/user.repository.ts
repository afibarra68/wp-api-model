import { getPool } from '../core/postgres';
import type { Role, User, UserApprovalStatus } from '../types/entities';

type Row = {
  id: string;
  nombre: string;
  email: string;
  password_hash: string;
  rol: Role;
  activo: boolean;
  estado_aprobacion: UserApprovalStatus;
  mfa_enabled: boolean;
  totp_secret: string | null;
  ultimo_login: Date | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: Row): User {
  return {
    id: r.id,
    nombre: r.nombre,
    email: r.email,
    passwordHash: r.password_hash,
    rol: r.rol,
    activo: r.activo,
    estadoAprobacion: r.estado_aprobacion ?? 'aprobado',
    mfaEnabled: r.mfa_enabled ?? false,
    totpSecret: r.totp_secret,
    ultimoLogin: r.ultimo_login,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const FIELDS =
  'id, nombre, email, password_hash, rol, activo, estado_aprobacion, mfa_enabled, totp_secret, ultimo_login, created_at, updated_at';

const PUBLIC_FIELDS =
  'id, nombre, email, rol, activo, estado_aprobacion, ultimo_login, created_at, updated_at';

export async function countUsers(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users');
  return Number(rows[0]?.c ?? 0);
}

export async function countPendingUsers(): Promise<number> {
  const { rows } = await getPool().query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM users WHERE estado_aprobacion = 'pendiente'`,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function findUserByEmail(email: string, withPassword = false): Promise<User | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  const u = rows[0] ? mapRow(rows[0]) : null;
  if (u && !withPassword) {
    delete u.passwordHash;
    delete u.totpSecret;
  }
  return u;
}

export async function findUserById(id: string, withPassword = false): Promise<User | null> {
  const { rows } = await getPool().query<Row>(`SELECT ${FIELDS} FROM users WHERE id = $1`, [id]);
  const u = rows[0] ? mapRow(rows[0]) : null;
  if (u && !withPassword) {
    delete u.passwordHash;
    delete u.totpSecret;
  }
  return u;
}

export interface UserListFilter {
  estadoAprobacion?: UserApprovalStatus;
}

export async function findAllUsers(filter: UserListFilter = {}): Promise<User[]> {
  const params: unknown[] = [];
  let where = '';
  if (filter.estadoAprobacion) {
    where = 'WHERE estado_aprobacion = $1';
    params.push(filter.estadoAprobacion);
  }
  const { rows } = await getPool().query<Row>(
    `SELECT ${PUBLIC_FIELDS} FROM users ${where} ORDER BY created_at DESC`,
    params,
  );
  return rows.map((r) => mapRow({ ...r, password_hash: '' }));
}

export async function createUser(input: {
  nombre: string;
  email: string;
  passwordHash: string;
  rol?: Role;
  activo?: boolean;
  estadoAprobacion?: UserApprovalStatus;
}): Promise<User> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO users (nombre, email, password_hash, rol, activo, estado_aprobacion)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${PUBLIC_FIELDS}`,
    [
      input.nombre,
      input.email.toLowerCase(),
      input.passwordHash,
      input.rol ?? 'agente',
      input.activo ?? true,
      input.estadoAprobacion ?? 'aprobado',
    ],
  );
  return mapRow({ ...rows[0], password_hash: '' });
}

export async function updateUser(
  id: string,
  patch: Partial<{
    nombre: string;
    rol: Role;
    activo: boolean;
    ultimoLogin: Date;
    passwordHash: string;
    estadoAprobacion: UserApprovalStatus;
    mfaEnabled: boolean;
    totpSecret: string | null;
  }>,
): Promise<User | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  let i = 2;
  if (patch.nombre !== undefined) {
    sets.push(`nombre = $${i++}`);
    vals.push(patch.nombre);
  }
  if (patch.rol !== undefined) {
    sets.push(`rol = $${i++}`);
    vals.push(patch.rol);
  }
  if (patch.activo !== undefined) {
    sets.push(`activo = $${i++}`);
    vals.push(patch.activo);
  }
  if (patch.ultimoLogin !== undefined) {
    sets.push(`ultimo_login = $${i++}`);
    vals.push(patch.ultimoLogin);
  }
  if (patch.passwordHash !== undefined) {
    sets.push(`password_hash = $${i++}`);
    vals.push(patch.passwordHash);
  }
  if (patch.estadoAprobacion !== undefined) {
    sets.push(`estado_aprobacion = $${i++}`);
    vals.push(patch.estadoAprobacion);
  }
  if (patch.mfaEnabled !== undefined) {
    sets.push(`mfa_enabled = $${i++}`);
    vals.push(patch.mfaEnabled);
  }
  if (patch.totpSecret !== undefined) {
    sets.push(`totp_secret = $${i++}`);
    vals.push(patch.totpSecret);
  }
  if (sets.length === 0) return findUserById(id);
  const { rows } = await getPool().query<Row>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING ${PUBLIC_FIELDS}`,
    vals,
  );
  return rows[0] ? mapRow({ ...rows[0], password_hash: '' }) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM users WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}
