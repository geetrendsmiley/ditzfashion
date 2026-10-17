import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  {
    name: 'The Everyday Tee',
    category: 'T-shirts',
    priceMinor: 1800000,
    color: 'Chalk',
    colorCode: '#dedbd2',
    tag: 'DITZ ESSENTIAL',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Relaxed white cotton t-shirt on a warm neutral background',
    description: 'The one you reach for, every time. Cut from heavyweight cotton with a relaxed, easy drape.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
  },
  {
    name: 'Off-Duty Hoodie',
    category: 'Sweats',
    priceMinor: 4200000,
    color: 'Stone',
    colorCode: '#b9b3a7',
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Soft neutral oversized hoodie',
    description: 'An oversized fleece layer for slow mornings and long ways home.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
  },
  {
    name: 'Sunday Shirt',
    category: 'Shirts',
    priceMinor: 3200000,
    color: 'Cloud',
    colorCode: '#edeae3',
    image: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Relaxed white button-up shirt',
    description: 'A breathable, relaxed shirt that works tucked or thrown on.',
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    name: 'Everywhere Trouser',
    category: 'Bottoms',
    priceMinor: 3800000,
    color: 'Ink',
    colorCode: '#33342f',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Black relaxed-fit trousers',
    description: 'A clean line with room to move, made for everyday.',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
  },
  {
    name: 'The Daily Tank',
    category: 'T-shirts',
    priceMinor: 1400000,
    color: 'Oat',
    colorCode: '#c8bda9',
    image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Minimal neutral tank top',
    description: 'Soft, breathable cotton with a shape that feels just right.',
    sizes: ['XS', 'S', 'M', 'L'],
  },
  {
    name: 'Weekend Crew',
    category: 'Sweats',
    priceMinor: 3600000,
    color: 'Moss',
    colorCode: '#747969',
    image: 'https://images.unsplash.com/photo-1578768079052-aa76e52ff62e?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Relaxed green sweatshirt',
    description: 'An easy, everyday layer with a lived-in feel.',
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    name: 'Daybreak Overshirt',
    category: 'Shirts',
    priceMinor: 4600000,
    color: 'Sand',
    colorCode: '#b9a88e',
    image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Light neutral overshirt',
    description: 'An easy in-between layer with enough weight to wear on its own.',
    sizes: ['S', 'M', 'L', 'XL'],
  },
  {
    name: 'Studio Cap',
    category: 'Accessories',
    priceMinor: 1600000,
    color: 'Midnight',
    colorCode: '#30322f',
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=900&q=85',
    imageAlt: 'Minimal black cap',
    description: 'Everyday cotton twill with an adjustable back.',
    sizes: ['ONE SIZE'],
  },
];

try {
  for (const [sortOrder, product] of products.entries()) {
    await prisma.product.upsert({
      where: { name: product.name },
      update: {},
      create: {
        ...product,
        stock: 25,
        isNewArrival: sortOrder > 3,
        isActive: true,
        sortOrder,
      },
    });
  }
  console.log(`Seeded ${products.length} example DITZ products.`);
} catch (error) {
  console.error('Could not seed example products.', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
