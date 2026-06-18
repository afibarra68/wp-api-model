export type ProviderType = 'simulation' | 'meta-cloud' | 'evolution';

/** Configuración efectiva de integración (DB o fallback .env). */
export type IntegrationSettings = {
  id?: string;
  name: string;
  provider: ProviderType;
  webhookVerifyToken: string;
  webhookPublicUrl?: string | null;
  whatsappToken: string;
  whatsappPhoneNumberId: string;
  whatsappApiVersion: string;
  whatsappProductPolicy?: 'CLOUD_API_FALLBACK' | 'STRICT' | null;
  whatsappMessageActivitySharing?: boolean | null;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
};

/** Fila en tabla integration_configs (sin exponer token completo en listados). */
export type IntegrationConfigTiming = {
  id: string;
  name: string;
  provider: ProviderType;
  isActive: boolean;
  whatsappPhoneNumberId: string | null;
  whatsappApiVersion: string;
  whatsappProductPolicy: string | null;
  whatsappMessageActivitySharing: boolean | null;
  webhookVerifyToken: string;
  webhookPublicUrl: string | null;
  evolutionBaseUrl: string | null;
  evolutionInstance: string | null;
  notes: string | null;
  hasWhatsappToken: boolean;
  hasEvolutionApiKey: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type IntegrationConfigRow = IntegrationConfigTiming & {
  whatsappToken: string | null;
  evolutionApiKey: string | null;
};

export type UpsertIntegrationInput = {
  name: string;
  provider: ProviderType;
  whatsappToken?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappApiVersion?: string;
  whatsappProductPolicy?: 'CLOUD_API_FALLBACK' | 'STRICT' | null;
  whatsappMessageActivitySharing?: boolean | null;
  webhookVerifyToken?: string;
  webhookPublicUrl?: string | null;
  evolutionBaseUrl?: string | null;
  evolutionApiKey?: string | null;
  evolutionInstance?: string | null;
  notes?: string | null;
};
