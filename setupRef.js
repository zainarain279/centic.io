import { ethers } from "ethers";
import fs from "fs";
import readline from "readline";
import log from "./utils/logger.js";

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Function to create a new wallet
function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();

  const walletDetails = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase,
  };

  log.info("New Ethereum Wallet created:");
  log.info(`Address: ${walletDetails.address}`);
  log.info(`Private Key: ${walletDetails.privateKey}`);
  log.info(`Mnemonic: ${walletDetails.mnemonic}`);

  return walletDetails;
}

// Function to save the wallet
function saveWalletToFile(walletDetails) {
  let wallets = [];
  let privateKeys = [];

  if (fs.existsSync("wallets.json")) {
    const data = fs.readFileSync("wallets.json");
    wallets = JSON.parse(data);
  }

  wallets.push(walletDetails);
  privateKeys.push(walletDetails.privateKey);

  fs.writeFileSync("wallets.json", JSON.stringify(wallets, null, 2));
  fs.appendFileSync("privateKeys.txt", "\n" + privateKeys.join("\n"));
  log.warn("Wallet saved to wallets.json");
}

async function askingHowManyWallets() {
  const answer = await askQuestion("How many wallets would you like to create? ");
  return parseInt(answer);
}

export { askingHowManyWallets, askQuestion, saveWalletToFile, createNewWallet };
