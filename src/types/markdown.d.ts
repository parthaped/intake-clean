/**
 * Webpack `asset/source` rule (configured in `next.config.ts`) makes every
 * `import x from "*.md"` resolve to the file's raw text. The TS compiler
 * doesn't see the webpack rule, so this ambient declaration is what lets
 * `src/lib/legal-policies.ts` type-check without `// @ts-expect-error`
 * suppressions on each import.
 */
declare module "*.md" {
  const content: string;
  export default content;
}
