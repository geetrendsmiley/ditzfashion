import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prisma = new PrismaClient();

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Store API exited before it was ready.');
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await delay(150);
    }
  }
  throw new Error('Store API did not start in time.');
}

test('customer accounts, saved addresses, country pricing, orders, and admin access', {
  skip: !process.env.DATABASE_URL && 'Set DATABASE_URL to run PostgreSQL API integration tests.',
  timeout: 45000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const suffix = randomBytes(5).toString('hex');
  const username = `buyer_${suffix}`;
  const email = `${username}@example.test`;
  const adminName = `admin_${suffix}`;
  const adminEmail = `${adminName}@example.test`;
  const productName = `API test piece ${suffix}`;
  let customerId;
  let adminId;
  let testProductId;
  let testOrderNumber;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      CLIENT_URL: baseUrl,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      TRUST_COUNTRY_HEADER: 'true',
      PAYSTACK_SECRET_KEY: 'sk_test_replace_me',
      WHATSAPP_PHONE_NUMBER: '2347030528292',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  async function request(url, { method = 'GET', cookie, body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }

  try {
    await waitForServer(baseUrl, child);
    const health = await request('/api/health');
    assert.equal(health.data.status, 'ok');

    const detected = await request('/api/store/location', { headers: { 'cf-ipcountry': 'GH' } });
    assert.equal(detected.data.detectedCountry, 'GH');
    assert.equal(detected.data.defaultCountry, 'GH');

    const signup = await request('/api/auth/signup', {
      method: 'POST',
      body: { email, username, password: 'DITZ-test-password-2026' },
    });
    assert.equal(signup.status, 201);
    assert.ok(signup.cookie?.startsWith('ditz_session='));
    customerId = signup.data.user.id;
    const account = await request('/api/auth/me', { cookie: signup.cookie });
    assert.equal(account.data.user.username, username);

    const addressResult = await request('/api/account/addresses', {
      method: 'POST',
      cookie: signup.cookie,
      body: {
        recipient: 'Test Customer',
        phone: '+233200000000',
        address: '1 Example Street',
        city: 'Accra',
        state: 'Greater Accra',
        country: 'GH',
        isDefault: true,
      },
    });
    assert.equal(addressResult.status, 201);

    const deniedAdminList = await request('/api/admin/products', { cookie: signup.cookie });
    assert.equal(deniedAdminList.status, 403);

    const adminPasswordHash = await bcrypt.hash('DITZ-admin-integration-test-2026', 12);
    const admin = await prisma.user.create({
      data: { email: adminEmail, username: adminName, passwordHash: adminPasswordHash, role: UserRole.ADMIN },
    });
    adminId = admin.id;
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { login: adminName, password: 'DITZ-admin-integration-test-2026' },
    });
    assert.equal(adminLogin.status, 200);

    const createdProduct = await request('/api/admin/products', {
      method: 'POST',
      cookie: adminLogin.cookie,
      body: {
        name: productName,
        description: 'A product created for API integration testing.',
        category: 'T-shirts',
        color: 'Cloud',
        colorCode: '#dedbd2',
        image: 'https://example.test/integration-product.jpg',
        imageAlt: 'API integration product test image',
        sizes: ['M', 'L'],
        price: 123.45,
        stock: 4,
        tag: 'NEW ARRIVAL',
        isNewArrival: true,
        isActive: true,
        countryPrices: [{ countryCode: 'GH', price: 98.76 }],
      },
    });
    assert.equal(createdProduct.status, 201);
    testProductId = createdProduct.data.product.id;
    assert.equal(createdProduct.data.product.countryPrices[0].currency, 'GHS');

    const countryProducts = await request('/api/products?country=GH');
    const storefrontProduct = countryProducts.data.products.find((product) => product.id === testProductId);
    assert.equal(storefrontProduct.countryPrices[0].amountMinor, 9876);

    const orderResult = await request('/api/orders', {
      method: 'POST',
      cookie: signup.cookie,
      body: {
        addressId: addressResult.data.address.id,
        countryCode: 'GH',
        paymentMethod: 'WHATSAPP',
        items: [{ productId: testProductId, size: 'M', quantity: 2 }],
      },
    });
    assert.equal(orderResult.status, 201, JSON.stringify(orderResult.data));
    testOrderNumber = orderResult.data.order.orderNumber;
    assert.equal(orderResult.data.order.currency, 'GHS');
    assert.equal(orderResult.data.order.subtotalMinor, 19752);
    assert.equal(orderResult.data.whatsappPhone, '2347030528292');
    assert.match(orderResult.data.address.address, /Example Street/);
    assert.equal((await prisma.product.findUnique({ where: { id: testProductId } })).stock, 2);
    assert.equal((await request('/api/account/orders', { cookie: signup.cookie })).data.orders[0].orderNumber, testOrderNumber);

    const cancelled = await request(`/api/admin/orders/${testOrderNumber}/status`, {
      method: 'PATCH',
      cookie: adminLogin.cookie,
      body: { status: 'CANCELLED' },
    });
    assert.equal(cancelled.status, 200);
    assert.equal((await prisma.product.findUnique({ where: { id: testProductId } })).stock, 4);
  } catch (error) {
    throw new Error(`${error.message}\nStore API output:\n${serverOutput}`);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(5000)]);
    }
    if (testOrderNumber) {
      const order = await prisma.order.findUnique({ where: { orderNumber: testOrderNumber }, include: { items: true } });
      if (order && order.status !== 'CANCELLED' && order.paymentStatus !== 'PAID') {
        for (const item of order.items) {
          if (item.productId) await prisma.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
      await prisma.order.deleteMany({ where: { orderNumber: testOrderNumber } });
    }
    if (testProductId) await prisma.product.deleteMany({ where: { id: testProductId } });
    if (customerId) await prisma.user.deleteMany({ where: { id: customerId } });
    if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  }
});
