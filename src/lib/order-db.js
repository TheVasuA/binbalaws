import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'orders.json');
const DEFAULT_DB = { orders: [] };

let writeQueue = Promise.resolve();

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDbFile();

  try {
    const content = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed?.orders)) {
      return { ...DEFAULT_DB };
    }
    return parsed;
  } catch {
    return { ...DEFAULT_DB };
  }
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function serializeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withWriteLock(task) {
  const nextTask = writeQueue.then(task, task);
  writeQueue = nextTask.then(() => undefined, () => undefined);
  return nextTask;
}

export async function createFuturesOrderRecord({
  symbol,
  side,
  quantity,
  leverage,
  orderResult,
  leverageResult,
  stopLossPrice = null,
  takeProfitPrice = null,
}) {
  return withWriteLock(async () => {
    const db = await readDb();
    const now = new Date().toISOString();

    const record = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      exchange: 'binance-futures',
      orderKind: 'futures-market-entry',
      status: 'placed',
      symbol: String(orderResult?.symbol || symbol || '').toUpperCase(),
      side: String(side || '').toUpperCase(),
      quantity: serializeNumber(orderResult?.origQty ?? quantity),
      executedQty: serializeNumber(orderResult?.executedQty ?? quantity),
      leverage: serializeNumber(leverageResult?.leverage ?? leverage),
      entryPrice: serializeNumber(orderResult?.avgPrice),
      requestedRisk: {
        stopLossPrice: serializeNumber(stopLossPrice),
        takeProfitPrice: serializeNumber(takeProfitPrice),
      },
      riskSetupStatus:
        stopLossPrice !== null || takeProfitPrice !== null
          ? 'stored_in_app_db'
          : 'not_requested',
      exchangeOrderId: orderResult?.orderId ?? null,
      exchangeClientOrderId: orderResult?.clientOrderId ?? null,
      exchangePayload: orderResult ?? null,
      leveragePayload: leverageResult ?? null,
    };

    db.orders.unshift(record);
    await writeDb(db);
    return record;
  });
}

export async function listStoredOrders({ symbol = null, limit = 100 } = {}) {
  const db = await readDb();
  const normalizedSymbol = symbol ? String(symbol).toUpperCase() : null;
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500));

  return db.orders
    .filter((order) => !normalizedSymbol || order.symbol === normalizedSymbol)
    .slice(0, safeLimit);
}

export async function getLatestStoredRiskByPosition() {
  const db = await readDb();

  return db.orders.reduce((lookup, order) => {
    const symbol = String(order?.symbol || '').toUpperCase();
    const side = String(order?.side || '').toUpperCase();
    const stopLossPrice = serializeNumber(order?.requestedRisk?.stopLossPrice);
    const takeProfitPrice = serializeNumber(order?.requestedRisk?.takeProfitPrice);

    if (!symbol || !side || (stopLossPrice === null && takeProfitPrice === null)) {
      return lookup;
    }

    const key = `${symbol}:${side}`;
    if (!lookup[key]) {
      lookup[key] = {
        stopLossPrice,
        takeProfitPrice,
        updatedAt: order?.updatedAt || order?.createdAt || null,
      };
    }

    return lookup;
  }, {});
}