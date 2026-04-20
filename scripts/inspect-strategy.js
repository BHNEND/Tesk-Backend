import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const strategy = await prisma.appStrategy.findFirst({
    where: { appId: '2040517478593339393' }
  });
  console.log('--- STRATEGY CONFIG INSPECTION ---');
  if (!strategy) {
    console.log('Strategy not found!');
  } else {
    console.log('AppID:', strategy.appId);
    console.log('Config Type:', typeof strategy.config);
    console.log('Config Content:', JSON.stringify(strategy.config, null, 2));
  }
}

main().finally(() => prisma.$disconnect());
