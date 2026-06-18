import dotenv from 'dotenv';

dotenv.config();

function str(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list(key: string, fallback: string[] = []): string[] {
  const v = process.env[key];
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const isVercel = !!process.env.VERCEL;

export const env = {
  nodeEnv: str('NODE_ENV', isVercel ? 'production' : 'development'),
  isProd: str('NODE_ENV', isVercel ? 'production' : 'development') === 'production',
  isVercel,
  port: num('PORT', 3000),
  corsOrigins: list('CORS_ORIGINS', isVercel ? [] : ['http://localhost:5173']),

  dbDriver: str('DB_DRIVER', isVercel ? 'mongo' : 'memory') as 'memory' | 'mongo',

  /** PostgreSQL — configuración de integraciones WhatsApp/Meta */
  databaseUrl: str('DATABASE_URL'),
  postgresSsl: str('POSTGRES_SSL', 'false') === 'true',

  mongoUri: str('MONGO_URI', 'mongodb://localhost:27017/whatsapp_control'),
  // En modo "memory": persistir los datos en disco para que sobrevivan reinicios.
  memoryDbPersist: str('MEMORY_DB_PERSIST', 'true') === 'true',
  memoryDbPath: str('MEMORY_DB_PATH', '.data/mongo'),

  queueDriver: str('QUEUE_DRIVER', isVercel ? 'db' : 'memory') as 'memory' | 'bullmq' | 'db',
  cronSecret: str('CRON_SECRET'),
  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),
  sendRatePerSecond: num('SEND_RATE_PER_SECOND', 2),

  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: str('JWT_REFRESH_EXPIRES_IN', '7d'),
  bcryptRounds: num('BCRYPT_ROUNDS', 10),

  seedAdminEmail: str('SEED_ADMIN_EMAIL', 'admin@local.test'),
  seedAdminPassword: str('SEED_ADMIN_PASSWORD', 'Cambiar.Esto.123'),
  seedMockups: str('SEED_MOCKUPS', 'true') === 'true',

  provider: str('PROVIDER', 'simulation') as 'simulation' | 'meta-cloud' | 'evolution',

  webhookVerifyToken: str('WEBHOOK_VERIFY_TOKEN', 'dev-verify-token'),

  whatsappToken: str('WHATSAPP_TOKEN'),
  whatsappPhoneNumberId: str('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappApiVersion: str('WHATSAPP_API_VERSION', 'v20.0'),
  /** Política por defecto para marketing_messages (CLOUD_API_FALLBACK | STRICT). Vacío = no enviar. */
  whatsappProductPolicy: str('WHATSAPP_PRODUCT_POLICY') as '' | 'CLOUD_API_FALLBACK' | 'STRICT',
  whatsappMessageActivitySharing: (() => {
    const v = process.env.WHATSAPP_MESSAGE_ACTIVITY_SHARING;
    if (v === undefined || v === '') return undefined;
    return v === 'true';
  })(),

  evolutionBaseUrl: str('EVOLUTION_BASE_URL'),
  evolutionApiKey: str('EVOLUTION_API_KEY'),
  evolutionInstance: str('EVOLUTION_INSTANCE'),
};

export type Env = typeof env;
