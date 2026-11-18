import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    'express', 'mongodb', 'redis', 'ioredis',
    'pg', 'mysql2', 'mysql2/promise',
    '@prisma/client', 'sequelize', 'typeorm',
    '@grpc/grpc-js', 'graphql',
    'amqplib', 'kafkajs', 'axios',
  ],
})
