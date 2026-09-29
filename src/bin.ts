#!/usr/bin/env node
import { runCli } from "./cli.js";

const result = runCli(process.argv.slice(2));
if (result.output) {
  console.log(result.output);
}
if (result.stderr) {
  console.error(result.stderr);
}
process.exit(result.exitCode);
