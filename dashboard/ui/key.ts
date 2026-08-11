const STORE = 'sprintos_key';

export const readKey = (): string => localStorage.getItem(STORE) ?? '';

export const saveKey = (key: string): void => localStorage.setItem(STORE, key);

export const clearKey = (): void => localStorage.removeItem(STORE);
