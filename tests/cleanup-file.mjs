import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const name = process.argv[2];
if (!/^integration-[0-9a-f-]+\.db$/.test(name) || basename(name) !== name) process.exit(1);
const path = resolve(process.cwd(), name);
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    await rm(path, { force: true });
    await rm(`${path}-wal`, { force: true });
    await rm(`${path}-shm`, { force: true });
    break;
  } catch (error) {
    if (error.code !== 'EBUSY' || attempt === 59) break;
    await delay(500);
  }
}
