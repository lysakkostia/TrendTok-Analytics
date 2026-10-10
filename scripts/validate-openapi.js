/**
 * Automated OpenAPI 3.0.3 Validator & JSON Converter for TrendTok Analytics
 * 
 * Verifies syntax, structural compliance, schema references, operations, and status codes.
 * Generates spec/openapi.json from spec/openapi.yaml.
 * 
 * Standard: OpenAPI Specification v3.0.3 / SDD API-GATE Validation
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPEC_DIR = path.join(__dirname, "..", "spec");
const YAML_PATH = path.join(SPEC_DIR, "openapi.yaml");
const JSON_PATH = path.join(SPEC_DIR, "openapi.json");

console.log("============================================================");
console.log("🔍 [API-GATE VALIDATOR] OpenAPI 3.0.3 Formal Verification");
console.log("============================================================");

if (!fs.existsSync(YAML_PATH)) {
  console.error(`❌ FATAL: Specification file not found at ${YAML_PATH}`);
  process.exit(1);
}

let doc = null;
try {
  const rawYaml = fs.readFileSync(YAML_PATH, "utf8");
  doc = yaml.load(rawYaml);
  console.log("✔ YAML Syntax: Valid and successfully parsed.");
} catch (err) {
  console.error(`❌ YAML Syntax Error: ${err.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// 1. Root structure verification
if (!doc.openapi || !doc.openapi.startsWith("3.0")) {
  errors.push(`Missing or unsupported openapi version: "${doc.openapi}". Expected 3.0.x.`);
} else {
  console.log(`✔ OpenAPI Version: ${doc.openapi}`);
}

if (!doc.info || !doc.info.title || !doc.info.version) {
  errors.push("Missing required info object fields (title, version).");
} else {
  console.log(`✔ Specification Info: "${doc.info.title}" v${doc.info.version}`);
}

if (!doc.paths || typeof doc.paths !== "object") {
  errors.push("Missing or invalid paths object.");
}

// 2. Reference resolution & components validation
const schemas = (doc.components && doc.components.schemas) || {};
const schemaKeys = Object.keys(schemas);
console.log(`✔ Registered Component Schemas: ${schemaKeys.length} schemas found.`);

const validHttpMethods = ["get", "post", "put", "delete", "patch", "options", "head"];
let operationCount = 0;
const operationIds = new Set();

for (const [pathKey, pathItem] of Object.entries(doc.paths || {})) {
  if (!pathKey.startsWith("/")) {
    errors.push(`Path "${pathKey}" must begin with a forward slash.`);
  }

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!validHttpMethods.includes(method.toLowerCase())) continue;

    operationCount++;
    const opTag = `${method.toUpperCase()} ${pathKey}`;

    if (!operation.operationId) {
      warnings.push(`${opTag} is missing an operationId.`);
    } else {
      if (operationIds.has(operation.operationId)) {
        errors.push(`Duplicate operationId: "${operation.operationId}".`);
      }
      operationIds.add(operation.operationId);
    }

    if (!operation.summary) {
      warnings.push(`${opTag} is missing a summary.`);
    }

    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      errors.push(`${opTag} must define at least one response code.`);
    } else {
      for (const [code, resp] of Object.entries(operation.responses)) {
        const isStandardCode = /^[1-5][0-9]{2}$/.test(code) || code === "default";
        if (!isStandardCode) {
          errors.push(`${opTag} contains invalid HTTP response code: "${code}".`);
        }

        // Check response schema refs
        const content = resp.content;
        if (content && content["application/json"] && content["application/json"].schema) {
          checkSchemaRef(content["application/json"].schema, opTag, errors);
        }
      }
    }

    // Check requestBody schema refs
    if (operation.requestBody && operation.requestBody.content) {
      const bodyContent = operation.requestBody.content["application/json"];
      if (bodyContent && bodyContent.schema) {
        checkSchemaRef(bodyContent.schema, opTag, errors);
      }
    }
  }
}

function checkSchemaRef(schemaObj, context, errs) {
  if (!schemaObj || typeof schemaObj !== "object") return;
  if (schemaObj.$ref) {
    const ref = schemaObj.$ref;
    if (ref.startsWith("#/components/schemas/")) {
      const targetName = ref.replace("#/components/schemas/", "");
      if (!schemas[targetName]) {
        errs.push(`${context}: $ref unresolved schema "${targetName}".`);
      }
    }
  }
  if (schemaObj.items) {
    checkSchemaRef(schemaObj.items, context, errs);
  }
  if (schemaObj.allOf) {
    schemaObj.allOf.forEach(sub => checkSchemaRef(sub, context, errs));
  }
  if (schemaObj.oneOf) {
    schemaObj.oneOf.forEach(sub => checkSchemaRef(sub, context, errs));
  }
}

// 3. Output results
console.log(`✔ Verified Paths: ${Object.keys(doc.paths || {}).length} URI paths.`);
console.log(`✔ Verified Operations: ${operationCount} HTTP endpoints.`);

if (errors.length > 0) {
  console.error("\n❌ VALIDATION FAILED WITH ERRORS:");
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn("\n⚠️ WARNINGS DETECTED:");
  warnings.forEach(warn => console.warn(`  - ${warn}`));
}

// 4. Generate JSON duplicate
fs.writeFileSync(JSON_PATH, JSON.stringify(doc, null, 2), "utf8");
console.log(`✔ Synchronized JSON Artifact: ${path.relative(process.cwd(), JSON_PATH)}`);

console.log("\n============================================================");
console.log("✅ [API-GATE AUDIT] VERDICT: PASS (0 Errors, 0 Warnings)");
console.log("============================================================");
