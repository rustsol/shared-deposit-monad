/**
 * Deploys SharedDepositEscrow to Monad Testnet (chain 10143) using the
 * deployer key from the gitignored contracts/.env (never printed, never
 * committed). Refuses to run against any other chain, verifies the real
 * receipt and deployed bytecode, and writes verified public metadata to
 * contracts/deployments/monad-testnet.json only after all checks pass.
 *
 * The deployer has NO special contract authority: SharedDepositEscrow has no
 * owner, no admin, no fees, and no rescue path. The deployer only pays gas.
 *
 * Refuses to overwrite an existing deployment record unless the recorded
 * contract no longer has code (e.g. a testnet reset), and archives the old
 * record in that case.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import hre from "hardhat";
import { formatEther, keccak256, stringToHex } from "viem";

const EXPECTED_CHAIN_ID = 10143;
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const METADATA_PATH = path.join(DEPLOYMENTS_DIR, "monad-testnet.json");

async function main(): Promise<void> {
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  if (!deployer) {
    throw new Error("No deployer account configured (PRIVATE_KEY missing in contracts/.env)");
  }

  const chainId = await publicClient.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`RPC chain id is ${chainId}, expected Monad Testnet ${EXPECTED_CHAIN_ID}`);
  }

  const artifact = await hre.artifacts.readArtifact("SharedDepositEscrow");
  const creationBytecode = artifact.bytecode as `0x${string}`;
  const expectedRuntime = artifact.deployedBytecode as `0x${string}`;

  // Existing-deployment guard.
  if (fs.existsSync(METADATA_PATH)) {
    const existing = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
    const code = await publicClient.getCode({ address: existing.contractAddress });
    if (code && code !== "0x") {
      throw new Error(
        `A verified deployment already exists at ${existing.contractAddress} and still has ` +
          "code. Refusing to redeploy silently — remove or archive the record only with " +
          "explicit approval."
      );
    }
    const archive = METADATA_PATH.replace(".json", `.superseded-${Date.now()}.json`);
    fs.renameSync(METADATA_PATH, archive);
    console.log(`previous record had no code onchain (network reset); archived to ${archive}`);
  }

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  const gasEstimate = await publicClient.estimateGas({
    account: deployer.account.address,
    data: creationBytecode,
  });
  const gasPrice = await publicClient.getGasPrice();
  const estimatedCost = gasEstimate * gasPrice;
  console.log(`deployer: ${deployer.account.address}`);
  console.log(`balance:  ${formatEther(balance)} MON`);
  console.log(`gas estimate: ${gasEstimate} @ ${formatEther(gasPrice)} MON/gas`);
  console.log(`estimated max cost: ${formatEther(estimatedCost)} MON`);
  if (balance < estimatedCost) {
    throw new Error("deployer balance cannot cover the estimated deployment cost");
  }

  console.log("sending real deployment transaction to Monad Testnet...");
  const { deploymentTransaction } = await hre.viem.sendDeploymentTransaction(
    "SharedDepositEscrow"
  );
  console.log(`broadcast: ${deploymentTransaction.hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: deploymentTransaction.hash,
  });
  if (receipt.status !== "success") {
    throw new Error(`deployment transaction reverted: ${txHash}`);
  }
  if (!receipt.contractAddress) {
    throw new Error("receipt contains no contract address");
  }

  const deployedCode = await publicClient.getCode({ address: receipt.contractAddress });
  if (!deployedCode || deployedCode === "0x") {
    throw new Error("deployed address has empty bytecode");
  }
  const runtimeHash = keccak256(deployedCode);
  const expectedRuntimeHash = keccak256(expectedRuntime);
  if (runtimeHash !== expectedRuntimeHash) {
    // With identical compiler settings and no immutables this must match
    // byte-for-byte; a mismatch means the wrong artifact was deployed.
    throw new Error(
      `runtime bytecode mismatch: onchain ${runtimeHash} != artifact ${expectedRuntimeHash}`
    );
  }

  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const buildInfoPaths = await hre.artifacts.getBuildInfoPaths();
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPaths[0], "utf-8"));
  const gitCommit = execSync("git rev-parse HEAD").toString().trim();

  const metadata = {
    schemaVersion: "1.0",
    networkName: "Monad Testnet",
    chainId: EXPECTED_CHAIN_ID,
    rpcNetworkIdentifier: "monadTestnet",
    contractName: "SharedDepositEscrow",
    contractAddress: receipt.contractAddress,
    deploymentTransactionHash: receipt.transactionHash,
    deploymentBlockNumber: Number(receipt.blockNumber),
    deploymentWalletAddress: deployer.account.address,
    deployedAtUtc: new Date(Number(block.timestamp) * 1000).toISOString(),
    gitCommitSha: gitCommit,
    solcVersion: buildInfo.solcLongVersion,
    optimizer: buildInfo.input.settings.optimizer,
    evmVersion: buildInfo.input.settings.evmVersion,
    creationBytecodeHash: keccak256(creationBytecode),
    runtimeBytecodeHash: runtimeHash,
    abiHash: keccak256(stringToHex(JSON.stringify(artifact.abi))),
    sourceVerification: {
      sourcify: "pending",
      monadscan: "pending",
    },
    explorers: {
      monadvisionContractUrl: `https://testnet.monadvision.com/address/${receipt.contractAddress}`,
      monadscanContractUrl: `https://testnet.monadscan.com/address/${receipt.contractAddress}`,
      deploymentTxMonadscanUrl: `https://testnet.monadscan.com/tx/${receipt.transactionHash}`,
    },
  };

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2) + "\n");

  console.log("");
  console.log("DEPLOYMENT VERIFIED");
  console.log(`contract:  ${receipt.contractAddress}`);
  console.log(`tx:        ${receipt.transactionHash}`);
  console.log(`block:     ${receipt.blockNumber}`);
  console.log(`gas used:  ${receipt.gasUsed}`);
  console.log(`runtime bytecode hash matches artifact: true`);
  console.log(`metadata:  ${METADATA_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
