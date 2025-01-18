import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import bangToib from "./utils/banner.js";
import log from "./utils/logger.js";
import fs from "fs";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();
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

function getRandomProxy(proxies) {
  if (!proxies || proxies.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}

function createAxiosInstance(proxy) {
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
async function fetchTasks(token, proxy = null) {
  const url = "https://develop.centic.io/ctp-api/centic-points/tasks";
  const axiosInstance = createAxiosInstance(proxy);

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

    log.info(`Unclaimed tasks:`, { taskCounts: unclaimedTasks.length });
    return unclaimedTasks;
  } catch (error) {
    log.error(`Error fetching tasks:`, error.message);
    return [];
  }
}

function generateNonce(length) {
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
async function fetchUserRank(token, proxy = null) {
  const url = "https://develop.centic.io/ctp-api/centic-points/user-rank";
  const axiosInstance = createAxiosInstance(proxy);

  try {
    const response = await axiosInstance.get(url, {
      headers: { "x-apikey": token },
    });
    const { _id, rank, totalPoint } = response.data;
    log.info(`User Info:`, { _id, rank, totalPoint });
    return { _id, rank, totalPoint };
  } catch (error) {
    log.error(`Error fetching rank:`, error.message);
    return null;
  }
}
async function claimUsers(token, proxy = null) {
  const url = "https://develop.centic.io/ctp-api/centic-points/invites";
  const axiosInstance = createAxiosInstance(proxy);
  try {
    await axiosInstance.post(
      url,
      {
        referralCode: "eJwFwQEBACAIA7BKR1QgDiLPYHw3PBoGttIs6F6rBXmA1qb4dIuM6iv7A_N3C3o=",
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

async function login(payload, proxy = null) {
  const url = "https://develop.centic.io/dev/v3/auth/login";
  const axiosInstance = createAxiosInstance(proxy);
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
    return null;
  }
}

// Claim task
async function claimTasks(token, task, proxy = null) {
  const url = "https://develop.centic.io/ctp-api/centic-points/claim-tasks";
  const axiosInstance = createAxiosInstance(proxy);

  try {
    const response = await axiosInstance.post(url, task, {
      headers: { "x-apikey": token },
    });
    log.info(`Claimed task Response:`, response.data);
  } catch (error) {
    log.error(`Error claiming task:`, error.message);
  }
}

async function generatePayload(account) {
  try {
    const localAccount = new ethers.Wallet(account); // Use the appropriate method to derive the account
    const address = localAccount.address;

    const nonce = generateNonce(6);
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

// Main function
async function main() {
  log.info(bangToib);

  const privateKeys = readFiles("privateKeys.txt").reverse();
  const wallets = readFiles("wallets.txt").reverse();

  const tokens = readFiles("tokens.txt").reverse();

  if (privateKeys.length === 0 || wallets.length < privateKeys.length) {
    log.error("length privateKeys.txt and length wallets.txt not equal");
    return;
  }

  if (tokens.length < privateKeys.length) {
    console.log(`Starting get tokens...`);
    for (let i = 0; i < privateKeys.length; i++) {
      if (tokens[i]) continue;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const payload = await generatePayload(privateKeys[i]);
      if (payload) {
        const token = await login(payload);
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

  const skipTaks = process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [];

  while (true) {
    for (const token of tokens) {
      try {
        const proxy = null;
        log.info(`Fetching User Data For:`, { token });
        await claimUsers(token, proxy);
        await fetchUserRank(token, proxy);

        let unclaimedTasks = await fetchTasks(token, proxy);
        if (unclaimedTasks.length === 0) {
          log.warn(`No unclaimed tasks available for:`, { token });
          continue;
        }
        unclaimedTasks = unclaimedTasks.filter((t) => !skipTaks.includes(t.taskId));
        for (const task of unclaimedTasks) {
          log.info(`Claiming task:`, { taskId: task.taskId });
          await claimTasks(token, task, proxy);
        }
      } catch (error) {
        log.error(`Critical error processing token: ${token} | Error:`, error.message);
      }
    }

    const wait = parseInt(process.env.TIME_SLEEP);
    log.debug(`Completed all accounts wait ${wait} minute...`);
    await new Promise((resolve) => setTimeout(resolve, wait * 60 * 1000));
  }
}

main();
