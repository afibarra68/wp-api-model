/**
 * Smoke test del flujo completo en modo simulación (sin Mongo/Redis externos).
 * Levanta la API con DB en memoria y cola en memoria, y ejecuta:
 *   login -> crear campaña -> preview -> launch -> esperar -> report
 *   -> simular webhook de entrega -> simular mensaje entrante (bot).
 *
 * Uso: npm run smoke
 */
process.env.DB_DRIVER = 'memory';
process.env.QUEUE_DRIVER = 'memory';
process.env.PROVIDER = 'simulation';
process.env.SEED_MOCKUPS = 'true';
process.env.SEND_RATE_PER_SECOND = '50'; // rápido para el test
process.env.PORT = '3999';
process.env.NODE_ENV = 'test';

const BASE = 'http://localhost:3999';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error('ASSERT FALLÓ: ' + msg);
}

async function api(path: string, opts: RequestInit = {}, token?: string) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { connectDb, disconnectDb } = await import('../src/core/db');
  const { createApp } = await import('../src/core/app');
  const { startDispatcher } = await import('../src/queue/dispatcher');
  const { getQueue } = await import('../src/queue');
  const { seedAdmin } = await import('../src/seed/seedAdmin');
  const { seedMockups } = await import('../src/seed/seedMockups');
  const { env } = await import('../src/config/env');

  await connectDb();
  await seedAdmin();
  await seedMockups();
  startDispatcher();
  const app = createApp();
  const server = app.listen(3999);
  await sleep(300);

  const log = (s: string) => console.log('• ' + s);

  try {
    // 1) Health
    const health = await api('/health');
    assert(health.status === 200, 'health 200');
    log(`health OK (provider=${(health.body as any).provider}, db=${(health.body as any).db})`);

    // 2) Login con usuario base
    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: env.seedAdminEmail, password: env.seedAdminPassword }),
    });
    assert(login.status === 200, 'login 200');
    const token = (login.body as any).token as string;
    assert(!!token, 'token presente');
    log('login OK, JWT recibido');

    // 3) Endpoint protegido sin token -> 401
    const noAuth = await api('/api/v1/clients');
    assert(noAuth.status === 401, 'clients sin token = 401');
    log('protección JWT OK (401 sin token)');

    // 4) Listar clientes y plantillas (seed)
    const clients = await api('/api/v1/clients?activo=true', {}, token);
    assert(clients.status === 200, 'clients 200');
    const totalActivos = (clients.body as any).total;
    log(`clientes activos: ${totalActivos}`);

    const templates = await api('/api/v1/templates', {}, token);
    const templateId = (templates.body as any[])[0]._id;
    assert(!!templateId, 'plantilla seed presente');
    log(`plantilla de prueba: ${(templates.body as any[])[0].nombre_meta}`);

    // 5) Crear campaña
    const camp = await api(
      '/api/v1/campaigns',
      {
        method: 'POST',
        body: JSON.stringify({
          nombre_campana: 'Smoke Test',
          plantilla_id: templateId,
          segmento: { solo_activos: true },
          mapeo_variables: [
            { indice: 1, origen: 'campo', valor: 'nombre' },
            { indice: 2, origen: 'fijo', valor: 'PRUEBA-1' },
          ],
        }),
      },
      token,
    );
    assert(camp.status === 201, 'campaña creada 201');
    const campId = (camp.body as any)._id;
    log(`campaña creada: ${campId}`);

    // 6) Preview
    const preview = await api(`/api/v1/campaigns/${campId}/preview`, {}, token);
    assert(preview.status === 200, 'preview 200');
    log(
      `preview: ${(preview.body as any).total_destinatarios} destinatarios, ejemplo="${
        (preview.body as any).ejemplo?.texto
      }"`,
    );

    // 7) Launch
    const launch = await api(`/api/v1/campaigns/${campId}/launch`, { method: 'POST' }, token);
    assert(launch.status === 200, 'launch 200');
    log(`launch: ${(launch.body as any).encolados} mensajes encolados`);

    // 8) Esperar a que la cola procese
    let report: any = null;
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const r = await api(`/api/v1/campaigns/${campId}/report`, {}, token);
      report = r.body;
      if (report.estado === 'finalizada') break;
    }
    assert(report.metricas.enviados > 0, 'hubo mensajes enviados');
    assert(report.estado === 'finalizada', 'campaña finalizada');
    log(
      `report: estado=${report.estado}, enviados=${report.metricas.enviados}/${report.metricas.total}`,
    );

    // 9) Tomar un log y simular webhook de entrega
    const logs = await api(`/api/v1/campaigns/${campId}/logs?estado=enviado`, {}, token);
    const firstLog = (logs.body as any).items[0];
    assert(!!firstLog.whatsapp_message_id, 'log tiene wamid');
    const wh = await api('/api/v1/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify({
        whatsapp_message_id: firstLog.whatsapp_message_id,
        nuevo_estado: 'entregado',
      }),
    });
    assert(wh.status === 200 && (wh.body as any).updated === true, 'webhook entregado aplicado');
    log('webhook de entrega aplicado (estado -> entregado)');

    // 10) Simular mensaje entrante que dispara el bot (regla "precio")
    const inbound = await api('/api/v1/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify({ telefono: firstLog.telefono, texto: 'cuanto es el precio?' }),
    });
    assert(inbound.status === 200, 'inbound 200');
    log(`bot respondió: accion=${(inbound.body as any).accion}`);

    // 11) Simular STOP -> opt-out
    const stop = await api('/api/v1/webhooks/simulate', {
      method: 'POST',
      body: JSON.stringify({ telefono: firstLog.telefono, texto: 'STOP' }),
    });
    assert((stop.body as any).accion === 'opt_out', 'STOP genera opt_out');
    log('STOP -> cliente dado de baja (opt_out)');

    console.log('\n✅ SMOKE TEST OK: el flujo completo funciona en modo simulación.');
  } finally {
    server.close();
    await getQueue().close();
    await disconnectDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ SMOKE TEST FALLÓ:', err.message);
    process.exit(1);
  });
