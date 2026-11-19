import {constants} from 'node:fs';
import {mkdir, open, lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

// Linux service vault: the key is a separate owner-only file, never an env var.
// This protects backups of credentials, not a machine whose service user is compromised.
export async function loadVault(directory, {initialize = false} = {}) {
  if (initialize) await mkdir(directory, {recursive:true, mode:0o700});
  const dir = await lstat(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) || dir.uid !== process.getuid())
    throw Error('Le dossier du coffre doit appartenir au service et être privé (700).');
  const filename = join(directory, 'vault.key');
  if (initialize) {
    let file;
    try {
      file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(randomBytes(32));
      await file.sync();
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    finally { await file?.close(); }
  }
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let key;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size !== 32 || (info.mode & 0o077) || info.uid !== process.getuid())
      throw Error('La clé du coffre doit appartenir au service et être privée (600).');
    key = await file.readFile();
  } finally { await file.close(); }
  return {
    id:'mcs-server-aes256gcm-v1', isAvailable:()=>true,
    encrypt(plaintext) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from('mcs-server-vault-v1'));
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
    },
    decrypt(bytes) {
      const data = Buffer.from(bytes);
      if (data.length < 29 || data[0] !== 1) throw Error('Coffre illisible.');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(1,13));
      decipher.setAAD(Buffer.from('mcs-server-vault-v1'));
      decipher.setAuthTag(data.subarray(13,29));
      return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString('utf8');
    },
  };
}
