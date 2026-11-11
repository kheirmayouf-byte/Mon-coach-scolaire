// OS-protected encryption; never replace an unavailable vault with plaintext.
export function credentialEncryption(storage, platform = process.platform) {
  const isAvailable = () => storage.isEncryptionAvailable() &&
    (platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend()));
  function requireVault() { if (!isAvailable()) throw Error('Le coffre sécurisé du système est indisponible.'); }
  return {
    id: 'mcs-electron-safe-storage-v1', isAvailable,
    encrypt(text) { requireVault(); return storage.encryptString(text); },
    decrypt(bytes) { requireVault(); return storage.decryptString(Buffer.from(bytes)); },
  };
}
