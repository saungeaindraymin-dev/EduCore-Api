import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { prisma } from '@/db';
import type { Prisma } from '@/generated/prisma/client';

/*
 * File storage. This is local disk, which is right for development and a single server.
 * The spec's Cloudflare R2 bucket replaces these four functions for production — nothing
 * outside this file reads or writes the bytes directly.
 */
const ROOT = path.resolve(env.UPLOAD_DIR);

/** A fresh, unguessable key. The uploader's filename is never part of it. */
export function newStorageKey(folder: string) {
  return `${folder}/${randomUUID()}`;
}

function onDisk(key: string) {
  const full = path.resolve(ROOT, key);
  // Keys are generated server-side, but refuse anything that could leave the upload folder
  if (!full.startsWith(ROOT + path.sep)) throw new Error(`Refusing storage key ${key}`);
  return full;
}

export async function putFile(key: string, bytes: Buffer) {
  const full = onDisk(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

/** The file's bytes, or null if it isn't in storage any more. */
export async function readStoredFile(key: string) {
  try {
    return await readFile(onDisk(key));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export async function deleteStoredFile(key: string) {
  await rm(onDisk(key), { force: true });
}

/**
 * Database cascades remove file rows but can't reach storage. Call this with the rows about
 * to go, before deleting their parent, then run the returned cleanup once the delete succeeds.
 */
export async function collectSubmissionFiles(where: Prisma.SubmissionFileWhereInput) {
  const rows = await prisma.submissionFile.findMany({ where, select: { storageKey: true } });
  return async () => {
    await Promise.all(rows.map((row) => deleteStoredFile(row.storageKey).catch(() => {})));
  };
}
