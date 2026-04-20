import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const key = 'test-api-key-123456';
  const existing = await prisma.apiKey.findUnique({ where: { key } });
  
  if (!existing) {
    await prisma.apiKey.create({
      data: {
        key,
        name: 'Local Test Key',
        status: 'active',
      },
    });
    console.log('✅ Created test API key: test-api-key-123456');
  } else {
    console.log('ℹ️ Test API key already exists: test-api-key-123456');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
