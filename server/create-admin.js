import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();
const [emailInput, usernameInput] = process.argv.slice(2);

async function readPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered privately.');
  }
  process.stdout.write('New admin password (12+ characters): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let password = '';
  return new Promise((resolve, reject) => {
    const onKey = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Administrator setup cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(password);
      } else if (key === '\u0008' || key === '\u007f') {
        password = password.slice(0, -1);
      } else if (key >= ' ') {
        password += key;
      }
    };
    function cleanup() {
      process.stdin.removeListener('data', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.stdin.on('data', onKey);
  });
}

if (!emailInput || !usernameInput) {
  console.error('Usage: npm run admin:create -- <email> <username>');
  process.exitCode = 1;
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput) || !/^[a-zA-Z0-9_.-]{3,32}$/.test(usernameInput)) {
  console.error('Provide a valid email and a 3–32 character username.');
  process.exitCode = 1;
} else {
  try {
    const password = await readPassword();
    if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email: emailInput.toLowerCase(),
        username: usernameInput.toLowerCase(),
        passwordHash,
        role: UserRole.ADMIN,
      },
    });
    console.log(`Administrator ${usernameInput} created. Store the password securely.`);
  } catch (error) {
    if (error.code === 'P2002') {
      console.error('An account with that email or username already exists.');
    } else {
      console.error('Could not create the administrator.', error.message);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
