import { sum, product } from './calc.mjs';

export { sum, product };

export function report() {
  return `sum(2,3)=${sum(2, 3)}; product(2,3)=${product(2, 3)}`;
}
