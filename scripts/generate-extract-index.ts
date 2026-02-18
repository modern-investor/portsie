#!/usr/bin/env npx tsx
/**
 * Regenerate the public/extracttests/index.html from existing test results.
 * Usage: npx tsx scripts/generate-extract-index.ts
 */
import { generateIndex } from "./lib/extract-test-index";

generateIndex();
console.log("Index regenerated: public/extracttests/index.html");
