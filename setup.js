import { ethers } from "ethers";
import fs from "fs/promises";

async function loadData(file) {
  let data = await fs.readFile(file, "utf-8");
  data = data
    .split("\n")
    .map((key) => key.trim())
    .filter(Boolean);

  return data;
}

export async function generateWallet() {
  try {
    // Read the privateKeys.txt file
    const privateKeysData = await loadData("privateKeys.txt");
    const wallets = await loadData("wallets.txt");

    for (let i = 0; i < privateKeysData.length; i++) {
      const localAccount = new ethers.Wallet(privateKeysData[i]);
      const address = localAccount.address;
      if (address) {
        // console.log("Generated Wallet Address:", address);
        wallets[i] = address;
      }
    }

    await fs.writeFile("wallets.txt", wallets.join("\n"));
    // console.log("Address saved to wallets.txt");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

await generateWallet();
