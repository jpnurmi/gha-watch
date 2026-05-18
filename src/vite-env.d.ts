declare module "*?raw" {
  const content: string;
  export default content;
}

declare module "*.css";

declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: string): string;
}
