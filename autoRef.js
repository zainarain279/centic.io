import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import bangToib from "./utils/banner.js";
import log from "./utils/logger.js";
import fs from "fs";
import { ethers } from "ethers";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url"; // Import necessary functions for file URL conversion
import { dirname } from "path"; // Import necessary functions for path manipulation
const __filename = fileURLToPath(import.meta.url); // Get the current module's filename
const __dirname = dirname(__filename);

import dotenv from "dotenv";
import { askingHowManyWallets, createNewWallet, saveWalletToFile } from "./setupRef.js";
dotenv.config();

class ClientAPI {
  constructor(queryId, accountIndex, proxy, privateKey, wallet, privateKeys) {
    this.privateKeys = privateKeys || [];
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.privateKey = privateKey || null;
    this.wallet = wallet || null;
    this.proxy = proxy;
    this.proxyIp = "Unknown IP";
    this.refCode = process.env.REF_CODE ? process.env.REF_CODE : "eJwFwQEBACAIA7BKR1QgDiLPYHw3PBoGttIs6F6rBXmA1qb4dIuM6iv7A_N3C3o=";
  }

  getRandomProxy(proxies) {
    if (!proxies || proxies.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * proxies.length);
    return proxies[randomIndex];
  }

  createAxiosInstance(proxy) {
    if (proxy) {
      const agent = new HttpsProxyAgent(proxy);
      return axios.create({
        httpsAgent: agent,
        proxy: false,
      });
    } else {
      return axios.create();
    }
  }

  // Fetch tasks
  async fetchTasks(token, proxy = null) {
    const url = "https://develop.centic.io/ctp-api/centic-points/tasks";
    const axiosInstance = this.createAxiosInstance(proxy);

    try {
      const response = await axiosInstance.get(url, {
        headers: { "x-apikey": token },
      });
      const taskResponse = response.data;

      const unclaimedTasks = [];
      const categories = ["Daily Tasks", "Daily login", "Social Tasks", "Special Tasks", "Bonus Reward"];
      categories.forEach((category) => {
        const tasks = taskResponse[category];
        if (Array.isArray(tasks)) {
          tasks.forEach((task) => {
            if (!task.claimed) {
              unclaimedTasks.push({ taskId: task._id, point: task.point });
            }
          });
        } else if (tasks && typeof tasks === "object") {
          if (!tasks.claimed) {
            unclaimedTasks.push({ taskId: tasks._id, point: tasks.point });
          }
        }
      });

      log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Unclaimed tasks:`, { taskCounts: unclaimedTasks.length });
      return unclaimedTasks;
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Error fetching tasks:`, error.message);
      return [];
    }
  }

  generateNonce(length) {
    let nonce = "";
    const firstDigit = "123456789"; // First digit cannot be 0
    const remainingDigits = "0123456789"; // Remaining digits can include 0

    nonce += firstDigit.charAt(Math.floor(Math.random() * firstDigit.length));

    for (let i = 1; i < length; i++) {
      nonce += remainingDigits.charAt(Math.floor(Math.random() * remainingDigits.length));
    }

    return nonce;
  }

  // Fetch user
  async fetchUserRank(token, proxy = null) {
    const url = "https://develop.centic.io/ctp-api/centic-points/user-rank";
    const axiosInstance = this.createAxiosInstance(proxy);

    try {
      const response = await axiosInstance.get(url, {
        headers: { "x-apikey": token },
      });
      const { _id, rank, totalPoint } = response.data;
      log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}] User Info:`, { _id, rank, totalPoint });
      return { _id, rank, totalPoint };
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}][${this.proxyIp}] Error fetching rank:`, error.message);
      return null;
    }
  }
  async claimUsers(token, proxy = null) {
    const url = "https://develop.centic.io/ctp-api/centic-points/invites";
    const axiosInstance = this.createAxiosInstance(proxy);
    let referralCode = this.refCode;
    const bonus = Math.floor(this.privateKeys.length * 0.1) || 0;
    if (this.accountIndex < bonus) {
      referralCode = "eJwFwQEBACAIA7BKR1QgDiLPYHw3PBoGttIs6F6rBXmA1qb4dIuM6iv7A_N3C3o=";
    }
    try {
      const response = await axiosInstance.post(
        url,
        {
          referralCode,
        },
        {
          headers: {
            "x-apikey": token,
          },
        }
      );
      return response.data;
    } catch (error) {
      return null;
    }
  }

  async login(payload, proxy = null) {
    const url = "https://develop.centic.io/dev/v3/auth/login";
    const axiosInstance = this.createAxiosInstance(proxy);
    try {
      const response = await axiosInstance.post(url, payload, {
        headers: {
          "x-apikey": "dXoriON31OO1UopGakYO9f3tX2c4q3oO7mNsjB2nJsKnW406",
        },
      });
      // console.log(response.data);
      const { apiKey } = response.data;
      return apiKey;
    } catch (error) {
      logger.error(`${error.message}`);
      return null;
    }
  }

  // Claim task
  async claimTasks(token, task, proxy = null) {
    const url = "https://develop.centic.io/ctp-api/centic-points/claim-tasks";
    const axiosInstance = this.createAxiosInstance(proxy);

    try {
      const response = await axiosInstance.post(url, task, {
        headers: { "x-apikey": token },
      });
      log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}] Claimed task Response:`, response.data);
    } catch (error) {
      log.warn(`[Account ${this.accountIndex + 1}][${this.proxyIp}] Error claiming task:`, error.message);
    }
  }

  async generatePayload(account) {
    try {
      const localAccount = new ethers.Wallet(account); // Use the appropriate method to derive the account
      const address = localAccount.address;

      const nonce = this.generateNonce(6);
      const message = `I am signing my one-time nonce: ${nonce}.\n\nNote: Sign to log into your Centic account. This is free and will not require a transaction.`;

      const signature = await localAccount.signMessage(message);

      return {
        address,
        signature,
        nonce,
      };
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  // Main function
  async runAccount() {
    const token = this.queryId;
    try {
      this.proxyIp = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    try {
      const proxy = this.proxy;
      const result = await this.claimUsers(token, proxy);
      log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}] Buff ref for ${result?.inviteAddress}:`, `${result?.message || result}`);
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Critical error processing token: ${token} | Error:`, error.message);
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, privateKey, wallet, privateKeys } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, privateKey, wallet, privateKeys);
  try {
    await to.runAccount();
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskCompleted");
    }
  }
}

function readFiles(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    return fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  } catch (error) {
    log.error(`Error reading file: ${filePath}`, error.message);
    return [];
  }
}

async function generateWallet() {
  try {
    // Read the privateKeys.txt file
    const privateKeysData = readFiles("privateKeys.txt");
    const wallets = readFiles("wallets.txt");

    for (let i = 0; i < privateKeysData.length; i++) {
      const localAccount = new ethers.Wallet(privateKeysData[i]);
      const address = localAccount.address;
      if (address) {
        // console.log("Generated Wallet Address:", address);
        wallets[i] = address;
      }
    }

    fs.writeFileSync("wallets.txt", wallets.join("\n"));
    // console.log("Address saved to wallets.txt");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

async function main() {
  log.info(bangToib);
  const numWallets = await askingHowManyWallets();
  for (let i = 0; i < numWallets; i++) {
    log.info(`Creating wallet #${i + 1}...`);

    const newWallet = createNewWallet();
    saveWalletToFile(newWallet);
  }

  await generateWallet();
  log.info("All wallets created.");

  let privateKeys = readFiles("privateKeys.txt");
  privateKeys = privateKeys.reverse().slice(0, numWallets);

  let wallets = readFiles("wallets.txt");
  wallets = wallets.reverse().slice(0, numWallets);

  let tokens = [];

  const proxies = readFiles("proxy.txt");

  if (privateKeys.length === 0 || wallets.length < privateKeys.length) {
    log.error("length privateKeys.txt and length wallets.txt not equal, run: node setup");
    return;
  }

  if (tokens.length > proxies.length) {
    log.error("length tokens and length proxies not equal");
    return;
  }

  if (tokens.length < privateKeys.length) {
    console.log(`Starting get tokens, don't stop...`);
    const client = new ClientAPI(tokens[0], 0, proxies[0], privateKeys[0], wallets[0], privateKeys);
    for (let i = 0; i < privateKeys.length; i++) {
      if (tokens[i]) continue;
      // await new Promise((resolve) => setTimeout(resolve, 1000));
      const payload = await client.generatePayload(privateKeys[i]);
      if (payload) {
        const token = await client.login(payload, proxies[i]);
        if (token) {
          log.success(`Getting token for account ${i + 1} : `, `successfully`);
          tokens[i] = token;
          fs.writeFileSync("tokens.txt", tokens.join("\n"));
        } else {
          log.warn(`Getting token for account ${i + 1}: failed`);
        }
      }
    }
  }

  // const useProxy = proxies && proxies.length > 0;
  let maxThreads = parseInt(process.env.MAX_THEADS);

  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < tokens.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, tokens.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            queryId: tokens[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
            privateKey: privateKeys[currentIndex % privateKeys.length],
            wallet: wallets[currentIndex % wallets.length],
            privateKeys: privateKeys,
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message == "taskCompleted") {
                worker.terminate();
              }
              // console.log(message);
              resolve();
            });
            worker.on("error", (error) => {
              console.log(error);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              worker.terminate();
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < tokens.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    log.debug(`Completed all accounts`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
