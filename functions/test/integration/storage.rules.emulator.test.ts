import * as fs from 'fs';
import * as path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const STORAGE_EMULATOR_PORT = 9199;
const tinyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'dealapp-storage-test',
    storage: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: STORAGE_EMULATOR_PORT,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('storage.rules — deals/{merchantId}/{fileName}', () => {
  it('lets a merchant write to their own deals folder', async () => {
    const merchantStorage = testEnv.authenticatedContext('merchant-a').storage();
    await assertSucceeds(
      uploadBytes(ref(merchantStorage, 'deals/merchant-a/photo.jpg'), tinyJpeg, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('denies a merchant writing into another merchant\'s deals folder', async () => {
    const merchantStorage = testEnv.authenticatedContext('merchant-a').storage();
    await assertFails(
      uploadBytes(ref(merchantStorage, 'deals/merchant-b/photo.jpg'), tinyJpeg, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('denies an unauthenticated write', async () => {
    const anonStorage = testEnv.unauthenticatedContext().storage();
    await assertFails(
      uploadBytes(ref(anonStorage, 'deals/merchant-a/photo.jpg'), tinyJpeg, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('lets anyone, even unauthenticated, read an existing deal photo', async () => {
    const ownerStorage = testEnv.authenticatedContext('merchant-a').storage();
    await assertSucceeds(
      uploadBytes(ref(ownerStorage, 'deals/merchant-a/photo.jpg'), tinyJpeg, {
        contentType: 'image/jpeg',
      }),
    );

    const anonStorage = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(getBytes(ref(anonStorage, 'deals/merchant-a/photo.jpg')));
  });
});
