#!/usr/bin/env node
// Prompt for the Discord OAuth values and write them into .dev.vars.
// The secret is not echoed back and no value is ever printed.
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import { PassThrough } from "node:stream";

const FILE = ".dev.vars";
const TEMPLATE = ".dev.vars.example";

function ensureFile() {
  if (!existsSync(FILE)) {
    copyFileSync(TEMPLATE, FILE);
    chmodSync(FILE, 0o600);
    console.log("Created .dev.vars from .dev.vars.example");
  }
}

function readStdinLines(count) {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => {
      const lines = buffer.split(/\r?\n/).map((line) => line.trim());
      resolve(lines.slice(0, count));
    });
  });
}

async function askHidden(rl, question) {
  const mute = new PassThrough();
  const realOutput = rl.output;
  rl.output = mute;
  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  } finally {
    rl.output = realOutput;
  }
}

function validate(id, secret) {
  const problems = [];
  if (!/^\d{17,20}$/.test(id)) problems.push("Client ID must be the 17-20 digit number from OAuth2 -> Client information.");
  if (secret.length < 10) problems.push("Client Secret looks too short. Copy the whole value.");
  return problems;
}

function writeValues(id, secret) {
  const current = readFileSync(FILE, "utf8");
  const setLine = (text, key, value) => {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    return pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  };
  let next = setLine(current, "DISCORD_CLIENT_ID", id);
  next = setLine(next, "DISCORD_CLIENT_SECRET", secret);
  writeFileSync(FILE, next, { encoding: "utf8", mode: 0o600 });
}

async function main() {
  ensureFile();

  let id;
  let secret;

  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    try {
      console.log("Paste the values from Discord Developer Portal -> your app -> OAuth2.");
      console.log("They are written to .dev.vars and never shown again.\n");
      id = (await new Promise((resolve) => rl.question("Discord Client ID: ", (a) => resolve(a.trim())))).trim();
      secret = await askHidden(rl, "Discord Client Secret (hidden): ");
    } finally {
      rl.close();
    }
  } else {
    const [pipedId = "", pipedSecret = ""] = await readStdinLines(2);
    id = pipedId;
    secret = pipedSecret;
  }

  const problems = validate(id, secret);
  if (problems.length) {
    for (const problem of problems) console.error(`- ${problem}`);
    console.error("\nNothing was written. Run `npm run setup:discord` again.");
    process.exit(1);
  }

  writeValues(id, secret);
  console.log("\nSaved to .dev.vars (mode 600, gitignored). Values were not printed.");
  console.log("Restart `npm run dev` if it is already running.");
}

main().catch((error) => {
  console.error(`setup:discord failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
