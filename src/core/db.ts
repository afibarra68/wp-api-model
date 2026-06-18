import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from './logger';

type CleanupOpts = { doCleanup?: boolean; force?: boolean };
let memoryServer: { stop: (opts?: CleanupOpts) => Promise<unknown> } | null = null;
// Cuando persistimos en disco no debemos limpiar el dbPath al apagar.
let memoryPersistent = false;

/**
 * Conecta a MongoDB.
 * - DB_DRIVER=mongo  -> usa MONGO_URI (Mongo real / docker).
 * - DB_DRIVER=memory -> levanta un MongoDB local (binario gestionado por
 *   mongodb-memory-server). Si MEMORY_DB_PERSIST=true (por defecto) los datos
 *   se guardan en MEMORY_DB_PATH y sobreviven a los reinicios.
 */
export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (env.isVercel && env.dbDriver !== 'mongo') {
    throw new Error('En Vercel configure DB_DRIVER=mongo y MONGO_URI (MongoDB Atlas).');
  }

  let uri = env.mongoUri;

  if (env.dbDriver === 'memory') {
    // Import dinámico para que la dependencia sea opcional en producción.
    const { MongoMemoryServer } = await import('mongodb-memory-server');

    if (env.memoryDbPersist) {
      const dbPath = path.resolve(process.cwd(), env.memoryDbPath);
      fs.mkdirSync(dbPath, { recursive: true });
      memoryPersistent = true;
      const server = await MongoMemoryServer.create({
        instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'whatsapp_control' },
      });
      memoryServer = server;
      uri = server.getUri('whatsapp_control');
      logger.info({ dbPath }, 'MongoDB local PERSISTENTE (los datos sobreviven reinicios)');
    } else {
      const server = await MongoMemoryServer.create();
      memoryServer = server;
      uri = server.getUri('whatsapp_control');
      logger.warn('Usando MongoDB EN MEMORIA efímero. Los datos NO persisten.');
    }
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('MongoDB conectado');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    // doCleanup:false evita borrar el dbPath persistente al apagar.
    await memoryServer.stop({ doCleanup: !memoryPersistent });
    memoryServer = null;
  }
}

export function dbStatus(): 'up' | 'down' {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
}
