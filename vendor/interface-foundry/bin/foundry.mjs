#!/usr/bin/env node
import { run } from '../lib/cli.mjs';

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(`Foundry: ${error.message}`);
  process.exitCode = 1;
}
