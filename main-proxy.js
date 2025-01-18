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
dotenv.config();

class ClientAPI {
  constructor(queryId, accountIndex, proxy, privateKey, wallet) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.privateKey = privateKey || null;
    this.wallet = wallet || null;
    this.proxy = proxy;
    this.proxyIp = "Unknown IP";
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
    try {
      await axiosInstance.post(
        url,
        {
          referralCode: process.env.REF_CODE ? process.env.REF_CODE : "eJwFwQEBACAIA7BKR1QgDiLPYHw3PBoGttIs6F6rBXmA1qb4dIuM6iv7A_N3C3o=",
        },
        {
          headers: {
            "x-apikey": token,
          },
        }
      );
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
      log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Fetching User Data For:`, `Account ${this.accountIndex + 1}`);
      await this.claimUsers(token, proxy);
      await this.fetchUserRank(token, proxy);

      let unclaimedTasks = await this.fetchTasks(token, proxy);
      if (unclaimedTasks.length === 0) {
        log.warn(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  No unclaimed tasks available for:`, `Account ${this.accountIndex + 1}`);
        return;
      }

      const skipTaks = process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [];

      unclaimedTasks = unclaimedTasks.filter((t) => !skipTaks.includes(t.taskId));

      for (const task of unclaimedTasks) {
        log.info(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Claiming task:`, { taskId: task.taskId });
        await this.claimTasks(token, task, proxy);
      }
    } catch (error) {
      log.error(`[Account ${this.accountIndex + 1}][${this.proxyIp}]  Critical error processing token: ${token} | Error:`, error.message);
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, privateKey, wallet } = workerData;
  const to = new ClientAPI(queryId, accountIndex, proxy, privateKey, wallet);
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

async function main() {
  log.info(bangToib);

  const privateKeys = readFiles("privateKeys.txt").reverse();
  const wallets = readFiles("wallets.txt").reverse();

  const tokens = readFiles("tokens.txt").reverse();

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
    for (let i = 0; i < privateKeys.length; i++) {
      if (tokens[i]) continue;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const client = new ClientAPI(tokens[i], i, proxies[i], privateKeys[i], wallets[i]);
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
    const wait = parseInt(process.env.TIME_SLEEP);
    log.debug(`Completed all accounts wait ${wait} minute...`);
    await new Promise((resolve) => setTimeout(resolve, wait * 60 * 1000));
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
