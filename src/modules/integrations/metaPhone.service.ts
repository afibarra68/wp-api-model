import { AppError } from '../../core/errors';
import { getIntegrationSettings } from './integration.config';

type MetaGraphError = {
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaCredentials = {
  token: string;
  phoneNumberId: string;
  apiVersion: string;
};

export type RequestCodeInput = {
  codeMethod: 'SMS' | 'VOICE';
  language: string;
  phoneNumberId?: string;
};

export type VerifyCodeInput = {
  code: string;
  phoneNumberId?: string;
};

export type RegisterPhoneInput = {
  pin: string;
  phoneNumberId?: string;
};

function resolveMetaCredentials(phoneNumberIdOverride?: string): MetaCredentials {
  const settings = getIntegrationSettings();
  if (settings.provider !== 'meta-cloud') {
    throw AppError.badRequest(
      'La verificación de número solo está disponible con provider meta-cloud',
    );
  }

  const token = settings.whatsappToken?.trim();
  const phoneNumberId = (phoneNumberIdOverride ?? settings.whatsappPhoneNumberId)?.trim();
  if (!token || !phoneNumberId) {
    throw AppError.badRequest(
      'Faltan credenciales WhatsApp. Configure WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en POST /integrations o .env',
    );
  }

  return {
    token,
    phoneNumberId,
    apiVersion: settings.whatsappApiVersion || 'v20.0',
  };
}

function graphBaseUrl(creds: MetaCredentials, action: string): string {
  return `https://graph.facebook.com/${creds.apiVersion}/${creds.phoneNumberId}/${action}`;
}

async function callMetaGraph(
  creds: MetaCredentials,
  action: string,
  options?: { query?: Record<string, string>; body?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const url = new URL(graphBaseUrl(creds, action));
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.token}`,
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await resp.json().catch(() => ({}))) as MetaGraphError & Record<string, unknown>;
  if (!resp.ok) {
    throw new AppError(
      502,
      'META_API_ERROR',
      data.error?.message ?? `Error de Meta al llamar ${action}`,
      data.error ?? data,
    );
  }

  return data;
}

/**
 * Paso 1 — Solicita el código de verificación (SMS o llamada de voz).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers/
 */
export async function requestVerificationCode(input: RequestCodeInput) {
  const creds = resolveMetaCredentials(input.phoneNumberId);
  const data = await callMetaGraph(creds, 'request_code', {
    query: {
      code_method: input.codeMethod,
      language: input.language,
    },
  });

  return {
    success: true,
    phoneNumberId: creds.phoneNumberId,
    codeMethod: input.codeMethod,
    language: input.language,
    meta: data,
  };
}

/**
 * Paso 2 — Envía el código de 6 dígitos recibido por SMS/voz.
 */
export async function verifyPhoneCode(input: VerifyCodeInput) {
  const creds = resolveMetaCredentials(input.phoneNumberId);
  const code = input.code.replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    throw AppError.badRequest('El código de verificación debe tener 6 dígitos');
  }

  const data = await callMetaGraph(creds, 'verify_code', {
    query: { code },
  });

  return {
    success: true,
    phoneNumberId: creds.phoneNumberId,
    meta: data,
  };
}

/**
 * Paso 3 — Registra el número para Cloud API con PIN de verificación en dos pasos.
 */
export async function registerPhoneNumber(input: RegisterPhoneInput) {
  const creds = resolveMetaCredentials(input.phoneNumberId);
  const pin = input.pin.replace(/\D/g, '');
  if (!/^\d{6}$/.test(pin)) {
    throw AppError.badRequest('El PIN debe tener exactamente 6 dígitos');
  }

  const data = await callMetaGraph(creds, 'register', {
    body: {
      messaging_product: 'whatsapp',
      pin,
    },
  });

  return {
    success: true,
    phoneNumberId: creds.phoneNumberId,
    meta: data,
  };
}
