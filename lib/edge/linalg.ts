/**
 * The little linear algebra the score model needs, by hand: a Cholesky
 * factorisation of a symmetric positive-definite matrix, a solve, and an
 * inverse. Matrices are arrays of rows.
 */
export type Mat = number[][];

export const zeros = (n: number, m = n): Mat => Array.from({ length: n }, () => new Array(m).fill(0));
export const eye = (n: number, s = 1): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? s : 0)));

/** A = L Lᵀ. Throws if A is not positive definite. */
export function cholesky(A: Mat): Mat {
  const n = A.length; const L = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) throw new Error('not positive definite'); L[i][i] = Math.sqrt(s); }
      else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** Solve A x = b for SPD A, through its Cholesky factor. */
export function cholSolve(L: Mat, b: readonly number[]): number[] {
  const n = L.length; const y = new Array(n).fill(0); const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

export function cholInverse(L: Mat): Mat {
  const n = L.length;
  const cols = Array.from({ length: n }, (_, j) => cholSolve(L, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}
