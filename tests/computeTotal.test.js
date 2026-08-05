import { describe, it, expect } from 'vitest';
import { computeTotal } from '../src/app.js';

describe('computeTotal', () => {
  it('retorna 0 para carrito vacío', () => {
    const carts = { 'Lider Real': [], 'Jumbo Real': [] };
    expect(computeTotal(carts, 'Lider Real')).toBe(0);
  });

  it('calcula correctamente un item', () => {
    const carts = { 'Lider Real': [{ price: 1000, quantity: 2 }], 'Jumbo Real': [] };
    expect(computeTotal(carts, 'Lider Real')).toBe(2000);
  });

  it('convierte strings numéricos correctamente', () => {
    const carts = { 'Lider Real': [{ price: '1500', quantity: '3' }] };
    expect(computeTotal(carts, 'Lider Real')).toBe(4500);
  });

  it('ignora valores no numéricos (los trata como 0)', () => {
    const carts = { 'Lider Real': [{ price: 'abc', quantity: 2 }, { price: 500, quantity: 'x' }] };
    expect(computeTotal(carts, 'Lider Real')).toBe(0);
  });
});
