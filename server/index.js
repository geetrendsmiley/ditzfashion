import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { PrismaClient, PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const cookieName = 'ditz_session';
const sessionDurationSeconds = 60 * 60 * 24 * 7;
const countries = {
  NG: { currency: 'NGN', locale: 'en-NG' },
  GH: { currency: 'GHS', locale: 'en-GH' },
  KE: { currency: 'KES', locale: 'en-KE' },
  GB: { currency: 'GBP', locale: 'en-GB' },
  US: { currency: 'USD', locale: 'en-US' },
  ZA: { currency: 'ZAR', locale: 'en-ZA' },
};
const productInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(5000),
  category: z.string().trim().min(2).max(80),
  color: z.string().trim().min(2).max(60),
  colorCode: z.string().regex(/^#[0-9a-f]{6}$/i),
  image: z.string().url().max(2048),
  imageAlt: z.string().trim().max(240).default(''),
  sizes: z.array(z.string().trim().min(1).max(30)).min(1).max(20),
  price: z.number().finite().min(0.01).max(20000000),
  compareAtPrice: z.number().finite().min(0.01).max(20000000).nullable().optional(),
  stock: z.number().int().min(0).max(1000000),
  tag: z.string().trim().max(40).default(''),
  isNewArrival: z.boolean().default(false),
  isActive: z.boolean().default(true),
  countryPrices: z.array(z.object({
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    price: z.number().finite().min(0.01).max(100000000),
  })).max(20).default([]),
});

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}
if (isProduction && !process.env.CLIENT_URL) {
  throw new Error('CLIENT_URL must be set to the public website origin in production.');
}

function setSessionCookie(response, token) {
  response.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: sessionDurationSeconds * 1000,
    path: '/',
  });
}

function createSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    sessionSecret,
    { expiresIn: sessionDurationSeconds, issuer: 'ditz-store' },
  );
}

function cookieToken(request) {
  const cookie = request.headers.cookie?.split('; ').find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
}

async function authenticate(request, response, next) {
  const token = cookieToken(request);
  if (!token) return response.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, sessionSecret, { issuer: 'ditz-store' });
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, role: true },
    });
    if (!user) return response.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
    request.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return response.status(401).json({ error: 'Your session expired. Please sign in again.' });
    }
    return next(error);
  }
}

function requireAdmin(request, response, next) {
  if (request.user?.role !== UserRole.ADMIN) {
    return response.status(403).json({ error: 'Store administrator access is required.' });
  }
  return next();
}

function validOrigin(request, response, next) {
  const origin = request.get('origin');
  const isWebhook = request.path === '/api/webhooks/paystack';
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (isProduction && changesState && !isWebhook && !origin) {
    return response.status(403).json({ error: 'A trusted request origin is required.' });
  }
  if (!origin) return next();
  const allowedOrigin = process.env.CLIENT_URL ? new URL(process.env.CLIENT_URL).origin : null;
  if (allowedOrigin && origin !== allowedOrigin) {
    return response.status(403).json({ error: 'The request origin is not allowed.' });
  }
  return next();
}

function parseBody(schema, request, response) {
  const result = schema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({ error: 'Please check the submitted information.', details: result.error.issues });
    return null;
  }
  return result.data;
}

function requestCountry(request) {
  if (process.env.TRUST_COUNTRY_HEADER !== 'true') return null;
  const code = request.get('cf-ipcountry')?.toUpperCase();
  return code && countries[code] ? code : null;
}

function serializeProduct(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    color: product.color,
    colorCode: product.colorCode,
    image: product.image,
    imageAlt: product.imageAlt,
    sizes: product.sizes,
    priceMinor: product.priceMinor,
    compareAtMinor: product.compareAtMinor,
    stock: product.stock,
    tag: product.tag,
    isNewArrival: product.isNewArrival,
    isActive: product.isActive,
    countryPrices: product.countryPrices,
  };
}

function serializeAddress(address) {
  return {
    id: address.id,
    label: address.label,
    recipient: address.recipient,
    phone: address.phone,
    address: address.address,
    city: address.city,
    state: address.state,
    country: address.country,
    isDefault: address.isDefault,
  };
}

function productData(input) {
  return {
    name: input.name,
    description: input.description,
    category: input.category,
    color: input.color,
    colorCode: input.colorCode,
    image: input.image,
    imageAlt: input.imageAlt,
    sizes: input.sizes,
    priceMinor: Math.round(input.price * 100),
    compareAtMinor: input.compareAtPrice ? Math.round(input.compareAtPrice * 100) : null,
    stock: input.stock,
    tag: input.tag,
    isNewArrival: input.isNewArrival,
    isActive: input.isActive,
  };
}

async function releaseUnpaidOrder(orderId) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.paymentStatus === PaymentStatus.PAID || order.status === 'CANCELLED') return;
    for (const item of order.items) {
      if (item.productId) {
        await transaction.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
    await transaction.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', paymentStatus: PaymentStatus.FAILED },
    });
  });
}

async function replaceCountryPrices(transaction, productId, prices) {
  await transaction.countryPrice.deleteMany({ where: { productId } });
  if (prices.length) {
    await transaction.countryPrice.createMany({
      data: prices.map(({ countryCode, price }) => ({
        productId,
        countryCode,
        currency: countries[countryCode]?.currency ?? 'NGN',
        amountMinor: Math.round(price * 100),
      })),
    });
  }
}

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({
  limit: '100kb',
  verify: (request, _response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  },
}));
app.use(validOrigin);
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/orders', rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));

app.get('/api/store/location', (request, response) => {
  const detectedCountry = requestCountry(request);
  response.json({
    detectedCountry,
    defaultCountry: detectedCountry ?? 'NG',
    countries: Object.entries(countries).map(([code, details]) => ({ code, ...details })),
  });
});

app.get('/api/products', async (request, response, next) => {
  try {
    const countryCode = z.string().regex(/^[A-Z]{2}$/).safeParse(request.query.country ?? 'NG');
    if (!countryCode.success) return response.status(400).json({ error: 'Choose a valid country.' });
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { countryPrices: true },
      orderBy: [{ isNewArrival: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return response.json({
      products: products.map((product) => serializeProduct(product)),
      countryCode: countryCode.data,
      currency: countries[countryCode.data]?.currency ?? 'NGN',
      priceCountryCode: products.some((product) => product.countryPrices.some((price) => price.countryCode === countryCode.data))
        ? countryCode.data
        : 'NG',
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/signup', async (request, response, next) => {
  const input = parseBody(z.object({
    email: z.string().trim().email().max(254),
    username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
    password: z.string().min(10).max(128),
  }), request, response);
  if (!input) return;
  try {
    if (input.paymentMethod === PaymentMethod.PAYSTACK && (!process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY === 'sk_test_replace_me')) {
      return response.status(503).json({ error: 'Online checkout is not configured yet. Choose WhatsApp or try again later.' });
    }
    if (input.paymentMethod === PaymentMethod.PAYSTACK && !isProduction && !process.env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
      return response.status(503).json({ error: 'Use Paystack test credentials while developing the store.' });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        passwordHash,
      },
      select: { id: true, email: true, username: true, role: true },
    });
    setSessionCookie(response, createSessionToken(user));
    return response.status(201).json({ user });
  } catch (error) {
    if (error.code === 'P2002') return response.status(409).json({ error: 'That email or username is already registered.' });
    return next(error);
  }
});

app.post('/api/auth/login', async (request, response, next) => {
  const input = parseBody(z.object({
    login: z.string().trim().min(3).max(254),
    password: z.string().min(1).max(128),
  }), request, response);
  if (!input) return;
  try {
    const login = input.login.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: login }, { username: login }] },
    });
    if (!user || !await bcrypt.compare(input.password, user.passwordHash)) {
      return response.status(401).json({ error: 'The email/username or password is incorrect.' });
    }
    const safeUser = { id: user.id, email: user.email, username: user.username, role: user.role };
    setSessionCookie(response, createSessionToken(safeUser));
    return response.json({ user: safeUser });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  response.status(204).end();
});

app.get('/api/auth/me', authenticate, (request, response) => response.json({ user: request.user }));

app.get('/api/account/addresses', authenticate, async (request, response, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: request.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return response.json({ addresses: addresses.map(serializeAddress) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/account/addresses', authenticate, async (request, response, next) => {
  const input = parseBody(z.object({
    label: z.string().trim().min(1).max(80).default('Shipping'),
    recipient: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(32),
    address: z.string().trim().min(5).max(500),
    city: z.string().trim().min(2).max(120),
    state: z.string().trim().min(2).max(120),
    country: z.string().regex(/^[A-Z]{2}$/).default('NG'),
    isDefault: z.boolean().default(true),
  }), request, response);
  if (!input) return;
  try {
    const created = await prisma.$transaction(async (transaction) => {
      if (input.isDefault) await transaction.address.updateMany({ where: { userId: request.user.id }, data: { isDefault: false } });
      const address = await transaction.address.create({ data: { ...input, userId: request.user.id } });
      return serializeAddress(address);
    });
    return response.status(201).json({ address: created });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/account/addresses/:id/default', authenticate, async (request, response, next) => {
  try {
    const address = await prisma.address.findFirst({ where: { id: request.params.id, userId: request.user.id } });
    if (!address) return response.status(404).json({ error: 'Address not found.' });
    const updated = await prisma.$transaction(async (transaction) => {
      await transaction.address.updateMany({ where: { userId: request.user.id }, data: { isDefault: false } });
      return transaction.address.update({ where: { id: address.id }, data: { isDefault: true } });
    });
    return response.json({ address: serializeAddress(updated) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/orders', authenticate, async (request, response, next) => {
  const input = parseBody(z.object({
    addressId: z.string().min(1),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    paymentMethod: z.nativeEnum(PaymentMethod),
    items: z.array(z.object({
      productId: z.string().min(1),
      size: z.string().trim().min(1).max(30),
      quantity: z.number().int().min(1).max(20),
    })).min(1).max(30),
  }), request, response);
  if (!input) return;
  try {
    if (input.paymentMethod === PaymentMethod.PAYSTACK && input.countryCode !== 'NG') {
      return response.status(400).json({ error: 'Paystack checkout is currently available for Nigeria (NGN) orders only.' });
    }
    const order = await prisma.$transaction(async (transaction) => {
      const address = await transaction.address.findFirst({ where: { id: input.addressId, userId: request.user.id } });
      if (!address) throw Object.assign(new Error('Select one of your saved shipping addresses.'), { status: 400 });
      if (address.country !== input.countryCode) {
        throw Object.assign(new Error('Choose the country that matches your selected shipping address to see the correct price.'), { status: 400 });
      }
      const orderItems = [];
      for (const item of input.items) {
        const product = await transaction.product.findUnique({
          where: { id: item.productId },
          include: { countryPrices: { where: { countryCode: input.countryCode } } },
        });
        if (!product || !product.isActive) throw Object.assign(new Error('A product in your bag is no longer available.'), { status: 409 });
        if (!Array.isArray(product.sizes) || !product.sizes.includes(item.size)) {
          throw Object.assign(new Error(`${product.name} is not available in size ${item.size}.`), { status: 400 });
        }
        if (product.stock < item.quantity) throw Object.assign(new Error(`${product.name} does not have enough stock for this order.`), { status: 409 });
        const countryPrice = product.countryPrices[0];
        const unitPriceMinor = countryPrice?.amountMinor ?? product.priceMinor;
        const currency = countryPrice?.currency ?? 'NGN';
        if (input.paymentMethod === PaymentMethod.PAYSTACK && currency !== 'NGN') {
          throw Object.assign(new Error('Paystack checkout is currently available for NGN prices only.'), { status: 400 });
        }
        orderItems.push({
          product,
          size: item.size,
          quantity: item.quantity,
          unitPriceMinor,
          currency,
        });
      }
      const currency = orderItems[0].currency;
      if (orderItems.some((item) => item.currency !== currency)) {
        throw Object.assign(new Error('Your bag contains products priced in different currencies. Please refresh your bag.'), { status: 400 });
      }
      const subtotalMinor = orderItems.reduce((total, item) => total + item.unitPriceMinor * item.quantity, 0);
      if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor > 2147483647) {
        throw Object.assign(new Error('This order total is too high. Please reduce the quantities in your bag.'), { status: 400 });
      }
      const orderNumber = `DITZ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const created = await transaction.order.create({
        data: {
          orderNumber,
          userId: request.user.id,
          addressId: address.id,
          customerName: address.recipient,
          customerEmail: request.user.email,
          customerPhone: address.phone,
          shippingAddress: address.address,
          shippingCity: address.city,
          shippingState: address.state,
          shippingCountry: address.country,
          countryCode: input.countryCode,
          currency,
          subtotalMinor,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentMethod === PaymentMethod.PAYSTACK ? PaymentStatus.PENDING : PaymentStatus.UNPAID,
          items: {
            create: orderItems.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              productImage: item.product.image,
              skuDescription: `${item.product.color} / ${item.size}`,
              unitPriceMinor: item.unitPriceMinor,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
      for (const item of orderItems) {
        const update = await transaction.product.updateMany({
          where: { id: item.product.id, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (update.count !== 1) throw Object.assign(new Error(`${item.product.name} stock changed while placing your order. Please review your bag.`), { status: 409 });
      }
      return created;
    }, { isolationLevel: 'Serializable' });

    if (input.paymentMethod === PaymentMethod.WHATSAPP) {
      return response.status(201).json({
        order: { orderNumber: order.orderNumber, currency: order.currency, subtotalMinor: order.subtotalMinor, paymentStatus: order.paymentStatus },
        whatsappPhone: (process.env.WHATSAPP_PHONE_NUMBER || '2347030528292').replace(/\D/g, ''),
        items: order.items.map((item) => ({
          name: item.productName,
          variant: item.skuDescription,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
        })),
        address: {
          recipient: order.customerName,
          phone: order.customerPhone,
          address: order.shippingAddress,
          city: order.shippingCity,
          state: order.shippingState,
          country: order.shippingCountry,
        },
      });
    }

    const paystackKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackKey || paystackKey === 'sk_test_replace_me') {
      return response.status(503).json({ error: 'Online checkout is not configured yet. Choose WhatsApp or try again later.' });
    }
    let paystackResponse;
    try {
      paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: request.user.email,
          amount: order.subtotalMinor,
          currency: 'NGN',
          reference: order.orderNumber,
          callback_url: process.env.PAYSTACK_CALLBACK_URL,
          metadata: { orderNumber: order.orderNumber, userId: request.user.id },
        }),
      });
    } catch (error) {
      await releaseUnpaidOrder(order.id);
      throw error;
    }
    let payment;
    try {
      payment = await paystackResponse.json();
    } catch (error) {
      await releaseUnpaidOrder(order.id);
      throw error;
    }
    if (!paystackResponse.ok || payment.status !== true || !payment.data?.authorization_url) {
      console.error('Paystack could not initialize checkout.', { status: paystackResponse.status, message: payment.message });
      await releaseUnpaidOrder(order.id);
      return response.status(502).json({ error: 'We could not start online checkout. Contact us or try WhatsApp.' });
    }
    await prisma.order.update({
      where: { id: order.id },
      data: { paystackReference: payment.data.reference, paymentAccessCode: payment.data.access_code },
    });
    return response.status(201).json({
      order: { orderNumber: order.orderNumber, currency: order.currency, subtotalMinor: order.subtotalMinor, paymentStatus: order.paymentStatus },
      authorizationUrl: payment.data.authorization_url,
    });
  } catch (error) {
    return next(error);
  }
});

async function verifyPaystackReference(reference) {
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackKey || !reference) throw Object.assign(new Error('Online payment verification is not configured.'), { status: 503 });
  const result = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackKey}` },
  });
  const body = await result.json();
  if (!result.ok || body.status !== true) throw Object.assign(new Error('We could not verify this payment yet. Please check again or contact us.'), { status: 502 });
  return body.data;
}

async function markPaymentPaid(reference, payment) {
  const order = await prisma.order.findUnique({ where: { orderNumber: reference } });
  if (!order) throw Object.assign(new Error('The order for this payment could not be found.'), { status: 404 });
  if (payment.reference !== reference || payment.status !== 'success' || payment.currency !== order.currency || payment.amount !== order.subtotalMinor) {
    throw Object.assign(new Error('Payment confirmation did not match the order. The order has not been marked as paid.'), { status: 409 });
  }
  if (order.paymentStatus !== PaymentStatus.PAID) {
    return prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PAID, status: 'CONFIRMED' },
    });
  }
  return order;
}

app.post('/api/payments/verify', authenticate, async (request, response, next) => {
  const input = parseBody(z.object({ reference: z.string().trim().min(1).max(120) }), request, response);
  if (!input) return;
  try {
    const order = await prisma.order.findFirst({
      where: { orderNumber: input.reference, userId: request.user.id },
      select: { orderNumber: true, currency: true, subtotalMinor: true },
    });
    if (!order) return response.status(404).json({ error: 'Order not found.' });
    const payment = await verifyPaystackReference(input.reference);
    const updated = await markPaymentPaid(input.reference, payment);
    return response.json({ orderNumber: updated.orderNumber, paymentStatus: updated.paymentStatus });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/webhooks/paystack', async (request, response, next) => {
  try {
    const signature = request.get('x-paystack-signature');
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!signature || !secret) return response.status(401).json({ error: 'Invalid payment webhook.' });
    const expected = crypto.createHmac('sha512', secret).update(request.rawBody).digest('hex');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return response.status(401).json({ error: 'Invalid payment webhook signature.' });
    }
    if (request.body.event === 'charge.success' && request.body.data?.reference) {
      const payment = await verifyPaystackReference(request.body.data.reference);
      await markPaymentPaid(request.body.data.reference, payment);
    }
    return response.status(200).json({ received: true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/account/orders', authenticate, async (request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: request.user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return response.json({
      orders: orders.map((order) => ({
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        createdAt: order.createdAt,
        items: order.items,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/products', authenticate, requireAdmin, async (_request, response, next) => {
  try {
    const products = await prisma.product.findMany({
      include: { countryPrices: true },
      orderBy: [{ isNewArrival: 'desc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    return response.json({ products: products.map(serializeProduct) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/products', authenticate, requireAdmin, async (request, response, next) => {
  const input = parseBody(productInputSchema, request, response);
  if (!input) return;
  try {
    const product = await prisma.$transaction(async (transaction) => {
      const created = await transaction.product.create({ data: productData(input) });
      await replaceCountryPrices(transaction, created.id, input.countryPrices);
      return transaction.product.findUnique({ where: { id: created.id }, include: { countryPrices: true } });
    });
    return response.status(201).json({ product: serializeProduct(product) });
  } catch (error) {
    if (error.code === 'P2002') return response.status(409).json({ error: 'A product with that name already exists.' });
    return next(error);
  }
});

app.patch('/api/admin/products/:id', authenticate, requireAdmin, async (request, response, next) => {
  const input = parseBody(productInputSchema, request, response);
  if (!input) return;
  try {
    const product = await prisma.$transaction(async (transaction) => {
      await transaction.product.update({ where: { id: request.params.id }, data: productData(input) });
      await replaceCountryPrices(transaction, request.params.id, input.countryPrices);
      return transaction.product.findUnique({ where: { id: request.params.id }, include: { countryPrices: true } });
    });
    if (!product) return response.status(404).json({ error: 'Product not found.' });
    return response.json({ product: serializeProduct(product) });
  } catch (error) {
    if (error.code === 'P2025') return response.status(404).json({ error: 'Product not found.' });
    if (error.code === 'P2002') return response.status(409).json({ error: 'A product with that name already exists.' });
    return next(error);
  }
});

app.delete('/api/admin/products/:id', authenticate, requireAdmin, async (request, response, next) => {
  try {
    await prisma.product.update({ where: { id: request.params.id }, data: { isActive: false } });
    return response.status(204).end();
  } catch (error) {
    if (error.code === 'P2025') return response.status(404).json({ error: 'Product not found.' });
    return next(error);
  }
});

app.get('/api/admin/orders', authenticate, requireAdmin, async (_request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return response.json({ orders });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/admin/orders/:orderNumber/status', authenticate, requireAdmin, async (request, response, next) => {
  const input = parseBody(z.object({
    status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  }), request, response);
  if (!input) return;
  try {
    const order = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.order.findUnique({
        where: { orderNumber: request.params.orderNumber },
        include: { items: true },
      });
      if (!existing) throw Object.assign(new Error('Order not found.'), { status: 404 });
      if (input.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
        if (existing.paymentStatus === PaymentStatus.PAID) {
          throw Object.assign(new Error('Refund the paid order before cancelling it.'), { status: 409 });
        }
        for (const item of existing.items) {
          if (item.productId) {
            await transaction.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
          }
        }
      }
      return transaction.order.update({ where: { id: existing.id }, data: { status: input.status } });
    });
    return response.json({ order: { orderNumber: order.orderNumber, status: order.status } });
  } catch (error) {
    return next(error);
  }
});

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const staticDirectory = path.resolve(currentDirectory, '../dist');
app.use(express.static(staticDirectory));
app.get('*path', (_request, response, next) => {
  response.sendFile(path.join(staticDirectory, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error, _request, response, _next) => {
  if (response.headersSent) return;
  if (error.code === 'P2034') {
    return response.status(409).json({ error: 'Inventory changed while placing your order. Please refresh the bag and try again.' });
  }
  if (error.code === 'P2025') return response.status(404).json({ error: 'The requested record was not found.' });
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('Request failed.', error);
  return response.status(status).json({
    error: status >= 500 ? 'Something went wrong. Please try again shortly.' : error.message,
  });
});

const server = app.listen(port, () => console.log(`DITZ store server listening on port ${port}.`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await prisma.$disconnect();
  });
}

export { app, prisma };
