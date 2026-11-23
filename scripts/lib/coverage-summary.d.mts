// The types of coverage-summary.mjs for the TypeScript tests; they mirror the JSDoc typedefs there.
export interface Count {
  total: number;
  covered: number;
}
export interface FileCoverage {
  lines: Count;
  branches: Count;
}
export interface PackageCoverage {
  name: string;
  files: number;
  lines: Count;
  branches: Count;
}
export function coverageByPackage(
  summary: Record<string, FileCoverage>,
  root: string,
): PackageCoverage[];
export function renderCoverageTable(rows: PackageCoverage[]): string;
