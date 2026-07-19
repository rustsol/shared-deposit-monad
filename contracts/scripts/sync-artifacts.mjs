// Synchronizes the REAL compiled SharedDepositEscrow artifact into the
// frontend and backend as deterministic generated modules. Never hand-edit
// the outputs. `--check` fails (exit 1) when the generated files have
// drifted from the current artifact - wired into CI so a stale ABI can never
// ship. Contains no keys and no deployment addresses (those live in
// contracts/deployments/*.json).
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.join(here, "..");
const artifactPath = path.join(
  contractsDir,
  "artifacts",
  "contracts",
  "SharedDepositEscrow.sol",
  "SharedDepositEscrow.json"
);

if (!fs.existsSync(artifactPath)) {
  console.error("artifact missing - run `npx hardhat compile` first");
  process.exit(1);
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

const buildInfoDir = path.join(contractsDir, "artifacts", "build-info");
const buildInfoFile = fs.readdirSync(buildInfoDir).find((f) => f.endsWith(".json"));
const buildInfo = JSON.parse(fs.readFileSync(path.join(buildInfoDir, buildInfoFile), "utf-8"));

const payload = {
  contractName: artifact.contractName,
  solcLongVersion: buildInfo.solcLongVersion,
  optimizer: buildInfo.input.settings.optimizer,
  evmVersion: buildInfo.input.settings.evmVersion,
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  deployedBytecode: artifact.deployedBytecode,
};

const frontendOut = path.join(
  contractsDir,
  "..",
  "frontend",
  "src",
  "generated",
  "sharedDepositEscrow.ts"
);
const backendOut = path.join(
  contractsDir,
  "..",
  "backend",
  "app",
  "blockchain",
  "generated",
  "shared_deposit_escrow.json"
);

const frontendContent = `// GENERATED FILE - do not edit by hand.
// Source: contracts/artifacts (real Hardhat compile output).
// Regenerate with: node contracts/scripts/sync-artifacts.mjs

export const sharedDepositEscrow = ${JSON.stringify(payload, null, 2)} as const;

export const sharedDepositEscrowAbi = sharedDepositEscrow.abi;
`;

const backendContent = JSON.stringify(payload, null, 2) + "\n";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const checkMode = process.argv.includes("--check");

let drift = false;
for (const [outPath, content] of [
  [frontendOut, frontendContent],
  [backendOut, backendContent],
]) {
  if (checkMode) {
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf-8") : "";
    if (sha(existing) !== sha(content)) {
      console.error(`DRIFT: ${outPath} does not match the compiled artifact`);
      drift = true;
    } else {
      console.log(`ok: ${path.relative(path.join(contractsDir, ".."), outPath)}`);
    }
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content);
    console.log(`wrote: ${path.relative(path.join(contractsDir, ".."), outPath)}`);
  }
}
if (checkMode && drift) process.exit(1);
