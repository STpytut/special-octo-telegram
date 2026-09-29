#!/usr/bin/env node
import { runCli } from "./cli.js";

const result = runCli(process.argv.slice(2));
if (result.exitCode === 0) {
  console.log(result.output);
} else {
  console.error(result.output);
}
process.exit(result.exitCode);
