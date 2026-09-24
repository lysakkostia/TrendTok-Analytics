#!/usr/bin/env node

/**
 * TrendTok Analytics - Automated SDD Gate Verification Script
 * Validates DoD (Definition of Done), test suite results, and traceability matrix alignment.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const COLOR_RESET = "\x1b[0m";
const COLOR_GREEN = "\x1b[32m";
const COLOR_RED = "\x1b[31m";
const COLOR_CYAN = "\x1b[36m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_BOLD = "\x1b[1m";

async function runGateCheck() {
  console.log(`\n${COLOR_BOLD}${COLOR_CYAN}=== TrendTok Analytics SDD Gate Verification ===${COLOR_RESET}\n`);

  let allPassed = true;

  // 1. Automated Test Suite Execution
  console.log(`${COLOR_BOLD}[1/3] Executing Automated Test Suite (node:test)...${COLOR_RESET}`);
  try {
    const testOutput = execSync("node --test tests/**/*.test.js", {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    console.log(`${COLOR_GREEN}✔ All unit and integration tests passed successfully.${COLOR_RESET}`);
  } catch (err) {
    console.error(`${COLOR_RED}✖ Test suite failed!${COLOR_RESET}`);
    console.error(err.stdout || err.stderr);
    allPassed = false;
  }

  // 2. Traceability Matrix Audit (REQ-FR Coverage)
  console.log(`\n${COLOR_BOLD}[2/3] Auditing Traceability Matrix Coverage...${COLOR_RESET}`);
  try {
    const srsContent = await fs.readFile(path.join(ROOT_DIR, "spec", "srs.md"), "utf-8");
    const rtmContent = await fs.readFile(path.join(ROOT_DIR, "spec", "traceability_matrix.md"), "utf-8");

    // Extract REQ-FR tags from SRS
    const srsMatches = srsContent.match(/REQ-FR-\d{2}/g) || [];
    const uniqueSrsReqs = Array.from(new Set(srsMatches));

    const missingInRtm = [];
    const unverifiedInRtm = [];

    for (const req of uniqueSrsReqs) {
      if (!rtmContent.includes(req)) {
        missingInRtm.push(req);
      } else {
        // Check if verified
        const line = rtmContent.split("\n").find(l => l.includes(req)) || "";
        if (!line.includes("VERIFIED (PASS)")) {
          unverifiedInRtm.push(req);
        }
      }
    }

    if (missingInRtm.length > 0) {
      console.error(`${COLOR_RED}✖ Missing from RTM: ${missingInRtm.join(", ")}${COLOR_RESET}`);
      allPassed = false;
    } else if (unverifiedInRtm.length > 0) {
      console.warn(`${COLOR_YELLOW}⚠ Requirements in progress (not yet VERIFIED): ${unverifiedInRtm.join(", ")}${COLOR_RESET}`);
      const allowInProgress = Boolean(process.env.ALLOW_IN_PROGRESS || process.argv.includes("--allow-in-progress"));
      if (!allowInProgress) {
        console.error(`${COLOR_RED}✖ Gate failed: All requirements must be VERIFIED (PASS) for release. Use ALLOW_IN_PROGRESS=1 for work-in-progress commits.${COLOR_RESET}`);
        allPassed = false;
      } else {
        console.log(`${COLOR_CYAN}ℹ Allowing in-progress requirements during feature/specification iteration.${COLOR_RESET}`);
      }
    } else {
      console.log(`${COLOR_GREEN}✔ 100% of Functional Requirements (${uniqueSrsReqs.length}/${uniqueSrsReqs.length}) verified in RTM.${COLOR_RESET}`);
    }
  } catch (err) {
    console.error(`${COLOR_RED}✖ Failed to audit traceability matrix: ${err.message}${COLOR_RESET}`);
    allPassed = false;
  }

  // 3. Code Style & Architecture Guard
  console.log(`\n${COLOR_BOLD}[3/3] Checking Architectural Invariants & Pure Functions...${COLOR_RESET}`);
  try {
    const scorerContent = await fs.readFile(path.join(ROOT_DIR, "src", "trendScorer.js"), "utf-8");
    if (scorerContent.includes("require(") || scorerContent.includes("module.exports")) {
      console.error(`${COLOR_RED}✖ CommonJS syntax detected in src/trendScorer.js! Must use pure ES Modules.${COLOR_RESET}`);
      allPassed = false;
    } else {
      console.log(`${COLOR_GREEN}✔ ES Modules standard upheld. Zero CommonJS dependencies.${COLOR_RESET}`);
    }
  } catch (err) {
    console.error(`${COLOR_RED}✖ Error reading source files: ${err.message}${COLOR_RESET}`);
    allPassed = false;
  }

  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log(`${COLOR_BOLD}${COLOR_GREEN}✅ SDD GATE AUDIT PASSED: Repository is clean and release-ready.${COLOR_RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${COLOR_BOLD}${COLOR_RED}❌ SDD GATE AUDIT FAILED: Resolve the issues above before committing.${COLOR_RESET}\n`);
    process.exit(1);
  }
}

runGateCheck();
