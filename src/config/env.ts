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
const isAppPlatform = !!process.env.DIGITALOCEAN_APP_ID;

export const env = {
  nodeEnv: str('NODE_ENV', isVercel || isAppPlatform ? 'production' : 'development'),
  isProd: str('NODE_ENV', isVercel || isAppPlatform ? 'production' : 'development') === 'production',
  isVercel,
  isAppPlatform,
  port: num('PORT', 3000),
  corsOrigins: list('CORS_ORIGINS', isVercel || isAppPlatform ? [] : ['http://localhost:5173']),

  /** PostgreSQL — única base de datos (negocio + integraciones) */
  databaseUrl: str(
    'DATABASE_URL',
    'postgresql://postgres:postgres@localhost:5432/whatsapp_control',
  ),
  postgresSsl: str('POSTGRES_SSL', isAppPlatform ? 'true' : 'false') === 'true',
  /** PEM del CA de DigitalOcean (opcional; en .env usar \\n entre líneas) */
  postgresCaCert: str('POSTGRES_CA_CERT').replace(/\\n/g, '\n'),

  queueDriver: str('QUEUE_DRIVER', isAppPlatform ? 'bullmq' : isVercel ? 'db' : 'memory') as 'memory' | 'bullmq' | 'db',
  cronSecret: str('CRON_SECRET'),
  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),
  sendRatePerSecond: num('SEND_RATE_PER_SECOND', 2),
  /** Días por defecto para repartir una campaña si no se indica tope ni duración. */
  campaignDefaultDias: num('CAMPAIGN_DEFAULT_DIAS', 7),

  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '15m'),
  jwtRefreshExpiresIn: str('JWT_REFRESH_EXPIRES_IN', '7d'),
  bcryptRounds: num('BCRYPT_ROUNDS', 10),

  seedAdminEmail: str('SEED_ADMIN_EMAIL', 'admin@local.test'),
  seedAdminPassword: str('SEED_ADMIN_PASSWORD', 'Cambiar.Esto.123'),
  seedMockups: str('SEED_MOCKUPS', 'false') === 'true',

  provider: str('PROVIDER', 'simulation') as 'simulation' | 'meta-cloud' | 'evolution',

  webhookVerifyToken: str('WEBHOOK_VERIFY_TOKEN', 'dev-verify-token'),

  whatsappToken: str('WHATSAPP_TOKEN'),
  whatsappPhoneNumberId: str('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappApiVersion: str('WHATSAPP_API_VERSION', 'v20.0'),
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
