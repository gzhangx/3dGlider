/** Solve (J^T J + lambda I) delta = -J^T residuals. */
export function solveDampedLeastSquares(jacobian: number[][], residuals: number[], lambda: number): number[] {
  const variableCount = jacobian[0]?.length ?? 0
  const equationCount = jacobian.length
  const augmented: number[][] = Array.from({ length: variableCount }, () => new Array(variableCount + 1).fill(0))

  for (let row = 0; row < variableCount; row++) {
    for (let col = row; col < variableCount; col++) {
      let value = 0
      for (let equation = 0; equation < equationCount; equation++) {
        value += jacobian[equation][row] * jacobian[equation][col]
      }
      augmented[row][col] = value
      augmented[col][row] = value
    }
    augmented[row][row] += lambda

    let rhs = 0
    for (let equation = 0; equation < equationCount; equation++) {
      rhs += jacobian[equation][row] * residuals[equation]
    }
    augmented[row][variableCount] = -rhs
  }

  gaussianElimination(augmented)
  const solution = new Array(variableCount).fill(0)
  for (let row = variableCount - 1; row >= 0; row--) {
    let value = augmented[row][variableCount]
    for (let col = row + 1; col < variableCount; col++) value -= augmented[row][col] * solution[col]
    const pivot = augmented[row][row]
    if (Math.abs(pivot) > 1e-12) solution[row] = value / pivot
  }
  return solution
}

function gaussianElimination(matrix: number[][]): void {
  const size = matrix.length
  for (let col = 0; col < size; col++) {
    let pivotRow = col
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivotRow][col])) pivotRow = row
    }
    if (pivotRow !== col) [matrix[col], matrix[pivotRow]] = [matrix[pivotRow], matrix[col]]
    if (Math.abs(matrix[col][col]) < 1e-12) continue
    for (let row = col + 1; row < size; row++) {
      const factor = matrix[row][col] / matrix[col][col]
      for (let index = col; index <= size; index++) matrix[row][index] -= factor * matrix[col][index]
    }
  }
}
