import { describe, expect, it, vi } from 'vitest';

// validateCNPJ is pure and doesn't touch auth - stub firebase-config.js and firebase/auth so
// importing auth.js doesn't eagerly initialize the real Firebase SDK. auth.js calls
// initializeAuth() at module load, which calls onAuthStateChanged(auth, ...) - the real
// function rejects a plain-object auth stub, so it needs stubbing too.
vi.mock('./firebase-config.js', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  signInWithPopup: () => Promise.resolve({ user: {} }),
  signOut: () => Promise.resolve(),
  onAuthStateChanged: () => () => {},
}));

import { validateCNPJ } from './auth.js';

describe('validateCNPJ', () => {
  it('aceita um CNPJ válido', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
  });

  it('aceita um CNPJ válido sem formatação', () => {
    expect(validateCNPJ('11222333000181')).toBe(true);
  });

  it('rejeita um CNPJ com dígito verificador errado', () => {
    expect(validateCNPJ('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
  });

  it('rejeita CNPJ com número de dígitos incorreto', () => {
    expect(validateCNPJ('123')).toBe(false);
  });
});
