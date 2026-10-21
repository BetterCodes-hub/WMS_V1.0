process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://wms:wms@localhost:5432/wms_test?schema=public';
process.env.JWT_SECRET = 'test-secret';
