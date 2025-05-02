const { ethers } = require("ethers");
const dotenv = require("dotenv");
const ora = require("ora").default;
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
});
const chalk = require("chalk/source"); // <-- Perhatikan bagian ini

dotenv.config();

// === Helper Colors & Emojis ===
const success = (msg) => chalk.green(`✅ ${msg}`);
const error = (msg) => chalk.red(`❌ ${msg}`);
const info = (msg) => chalk.blue(`🔵 ${msg}`);
const warn = (msg) => chalk.yellow(`🟡 ${msg}`);
const spin = (msg) => chalk.cyan(`🌀 ${msg}`);
const rocket = (msg) => chalk.magenta(`🚀 ${msg}`);

// === Utility Functions ===
async function delayWithSpinner(message) {
  const spinner = ora({ text: spin(message), color: "cyan", spinner: "dots" }).start();
  const ms = Math.floor(Math.random() * 5000) + 3000;
  await new Promise((resolve) => setTimeout(resolve, ms));
  spinner.succeed(chalk.green(`✔️ Selesai: ${message} (${(ms / 1000).toFixed(1)} detik)`));
}

async function waitWithSpinner(tx, label = "Menunggu konfirmasi transaksi...") {
  const spinner = ora({ text: warn(label), color: "yellow", spinner: "dots" }).start();
  try {
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      spinner.succeed(success("Transaksi sukses dikonfirmasi"));
    } else {
      spinner.fail(error("Transaksi gagal saat konfirmasi"));
    }
    return receipt;
  } catch (e) {
    spinner.fail(error("Konfirmasi transaksi error"));
    throw e;
  }
}

// === Config & Contracts ===
const RPC_URL = process.env.RPC_URL || "https://sepolia.optimism.io";
const PRIVATE_KEYS = process.env.PRIVATE_KEYS?.split(",").map(k => k.trim()).filter(Boolean);
if (!PRIVATE_KEYS || PRIVATE_KEYS.length === 0) {
  console.error(error("Missing PRIVATE_KEYS di .env"));
  process.exit(1);
}
const provider = new ethers.JsonRpcProvider(RPC_URL);

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)"
];

const UNIFIED_LIQUIDITY_POOL_ADDR = "0xe81c469181ca7a57cb4df8656e2fc41f8c92405c";
const UNIFIED_ABI = [
  "function calculateSwapOutputAmount(address, address, uint256) view returns (uint256, uint256)",
  "function swapTokens(address, address, uint256, uint256) returns (uint256)",
  "function provideLiquidity(address, uint256) returns (uint256)",
  "function removeLiquiditySingleToken(address, uint256) returns (uint256)",
  "function isTokenSupported(address) view returns (bool)"
];

const FAUCET_ADDR = "0xa65b8780f126f16e1051e77209f1f8a4e74edc79";
const FAUCET_DATA_LIST = [
  { token: "WETH", data: "0x1c11fce2000000000000000000000000915d965c881fe4a39f410515d9f38b0b2e719a640000000000000000000000000000000000000000000000000de0b6b3a7640000" },
  { token: "CRV", data: "0x1c11fce200000000000000000000000020994adb975d6196ad8026cae296d4285c8ac20f0000000000000000000000000000000000000000000000000de0b6b3a7640000" },
  { token: "SUSHI", data: "0x1c11fce2000000000000000000000000a1d656b741ba80c665216a28eb7361bf2578f1d80000000000000000000000000000000000000000000000000de0b6b3a7640000" },
  { token: "UNI", data: "0x1c11fce2000000000000000000000000657b37f5b4d007f8cda5c8b22304da70f1a552410000000000000000000000000000000000000000000000000de0b6b3a7640000" },
  { token: "USDC", data: "0x1c11fce20000000000000000000000000ad30413bf3e83e1ad6120516cd07d677f015f5c000000000000000000000000000000000000000000000000000000003b9aca00" }
];

const VAULT_ADDR = "0x70042114da5f06fd82a06b33f0d34710f0e7ead8";
const VAULT_ABI = [
  "function redeemToSingleToken(uint256 inputAmount, address outputToken, uint256 minOutputAmount) external returns (uint256)",
  "function issueWithSingleToken(address inputToken, uint256 inputAmount, uint256 minDerivativeAmount) external returns (uint256)"
];

const TOKENS = {
  WETH:  "0x915d965C881fe4a39f410515d9f38B0B2e719a64",
  hDEFI: "0xaCE1B82D83529BB8e385A53028E76225CA3393ae",
  CRV:   "0x20994ADb975D6196AD8026CAE296d4285c8AC20f",
  SUSHI: "0xa1D656B741bA80C665216A28Eb7361Bf2578F1D8",
  UNI:   "0x657b37F5B4D007F8CDA5C8b22304da70F1A55241",
  USDC:  "0x0Ad30413bF3E83e1aD6120516CD07D677f015f5c"
};

// === Wallet Task Functions ===
async function runWalletTasks(privateKey, index, options = {}) {
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = wallet.address;
  console.log(info(`\n=== Wallet ${index + 1}: ${address} ===`));

  const tokens = {};
  for (const [sym, addr] of Object.entries(TOKENS)) {
    tokens[sym] = new ethers.Contract(addr, ERC20_ABI, wallet);
  }

  const vault = new ethers.Contract(VAULT_ADDR, VAULT_ABI, wallet);
  const unifiedLiquidityPool = new ethers.Contract(UNIFIED_LIQUIDITY_POOL_ADDR, UNIFIED_ABI, wallet);

  // --- Swap Function ---
  async function redeemSingleToken(inputSym, outputSym, amountIn, minOut) {
    try {
      const bal = await tokens[inputSym].balanceOf(wallet.address);
      if (bal < amountIn) {
        console.log(warn(`Saldo ${inputSym} kurang dari ${ethers.formatUnits(amountIn, inputSym === "USDC" ? 6 : 18)}`));
        return;
      }

      await delayWithSpinner(`Swap ${inputSym} ke ${outputSym}`);
      await approveAlways(inputSym, VAULT_ADDR, amountIn);

      if (inputSym === "hDEFI") {
        const tx = await vault.redeemToSingleToken(amountIn, TOKENS[outputSym], minOut);
        console.log(success(`Swap tx hash: ${tx.hash}`));
        await waitWithSpinner(tx, `Mengirim tx redeem ${inputSym}->${outputSym}`);
      } else if (outputSym === "hDEFI") {
        const tx = await vault.issueWithSingleToken(TOKENS[inputSym], amountIn, minOut);
        console.log(success(`Swap tx hash: ${tx.hash}`));
        await waitWithSpinner(tx, `Mengirim tx Swap ${inputSym}->${outputSym}`);
      } else {
        console.log(warn("Token pair tidak valid"));
      }
    } catch (e) {
      console.error(error(`Error redeem ${inputSym}->${outputSym}: ${e.reason || e.code || e.message}`));
    }
  }

  // --- Approve Function ---
  async function approveAlways(tokenSym, spender, amount) {
    const allowance = await tokens[tokenSym].allowance(wallet.address, spender);
    if (allowance < amount) {
      const tx = await tokens[tokenSym].approve(spender, ethers.MaxUint256);
      console.log(success(`Approving ${tokenSym}: ${tx.hash}`));
      await waitWithSpinner(tx, `Mengirim tx approve ${tokenSym}`);
    }
  }

  // --- Provide and Remove Liquidity ---
  async function provideAndRemoveLiquidityAll() {
    for (const symbol of ["WETH", "CRV", "SUSHI", "UNI", "USDC"]) {
      try {
        const decimals = symbol === "USDC" ? 6 : 18;
        const amount = ethers.parseUnits("0.02", decimals);

        const balance = await tokens[symbol].balanceOf(wallet.address);
        console.log(info(`Saldo ${symbol}: ${ethers.formatUnits(balance, decimals)}`));
        if (balance < amount) {
          console.log(warn(`Saldo ${symbol} tidak cukup untuk ${ethers.formatUnits(amount, decimals)}`));
          continue;
        }

        await delayWithSpinner(`Provide ${symbol}`);
        await approveAlways(symbol, UNIFIED_LIQUIDITY_POOL_ADDR, amount);

        const provideTx = await unifiedLiquidityPool.provideLiquidity(TOKENS[symbol], amount);
        console.log(success(`Provide ${symbol}: ${provideTx.hash}`));
        const provideReceipt = await waitWithSpinner(provideTx, `Mengirim tx provide ${symbol}`);

        let shares = null;
        for (const log of provideReceipt.logs) {
          try {
            const value = BigInt(log.data);
            if (value > 0n) {
              shares = value;
              break;
            }
          } catch {}
        }

        if (!shares) {
          console.log(warn(`Gagal dapatkan shares ${symbol}`));
          continue;
        }

        const sharesToRemove = shares * 75n / 100n;
        await delayWithSpinner(`Remove ${symbol}`);
        const removeTx = await unifiedLiquidityPool.removeLiquiditySingleToken(TOKENS[symbol], sharesToRemove);
        console.log(success(`Remove ${symbol}: ${removeTx.hash}`));
        await waitWithSpinner(removeTx, `Mengirim tx remove ${symbol}`);
      } catch (e) {
        console.error(error(`Error ${symbol}: ${e.reason || e.code || e.message}`));
      }
    }
  }

  // --- Claim Faucet ---
  async function claimFaucet() {
    for (const { token, data } of FAUCET_DATA_LIST) {
      try {
        await delayWithSpinner(`Claiming faucet ${token}...`);
        const tx = await wallet.sendTransaction({ to: FAUCET_ADDR, data, gasLimit: 100_000 });
        console.log(success(`Faucet ${token} tx dikirim: ${tx.hash}`));
        await waitWithSpinner(tx, `Menunggu konfirmasi faucet ${token}...`);
      } catch (e) {
        console.log(error(`Klaim faucet ${token} gagal: ${e.reason || e.code || e.message}`));
      }
    }
  }

  // --- Run Based on Options ---
  if (options.claim) await claimFaucet();
  if (options.swap && options.swapCount > 0) {
    for (let i = 0; i < options.swapCount; i++) {
      console.log(info(`\n--- SWAP KE-${i + 1} ---`));
      await redeemSingleToken("hDEFI", "WETH", ethers.parseUnits("0.01", 18), ethers.parseUnits("0.000005", 18));
      for (const token of ["WETH", "CRV", "SUSHI", "UNI"]) {
        await redeemSingleToken(token, "hDEFI", ethers.parseUnits("0.01", 18), ethers.parseUnits("0.000005", 18));
      }
      await redeemSingleToken("hDEFI", "USDC", ethers.parseUnits("0.01", 18), ethers.parseUnits("0.000005", 6));
    }
  }
  if (options.provide) await provideAndRemoveLiquidityAll();
  if (options.remove) await provideAndRemoveLiquidityAll(); // remove dilakukan dalam fungsi yang sama
}

// === CLI Menu ===
async function showMenu() {
  console.clear();
  console.log(rocket("============================================"));
  console.log(rocket("        Selamat Datang di Testnet Bot       "));
  console.log(rocket("============================================"));
  console.log("Bot ini mendukung beberapa fungsi interaksi ");
  console.log("dengan kontrak blockchain testnet.\n");

  console.log(info("[1] Klaim Faucet"));
  console.log(info("[2] Swap Token (hDEFI ↔ Token Lain)"));
  console.log(info("[3] Provide Liquidity"));
  console.log(info("[4] Remove Liquidity"));
  console.log(info("[5] Jalankan Semua Fungsi"));
  console.log(info("[0] Keluar\n"));

  readline.question("Masukkan pilihan: ", async (choice) => {
    switch (choice) {
      case "1":
        console.log(info("\nJalankan klaim faucet untuk semua wallet..."));
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
          await runWalletTasks(PRIVATE_KEYS[i], i, { claim: true });
        }
        break;

      case "2":
        readline.question("Berapa kali ingin melakukan swap? (max 5): ", async (countStr) => {
          const count = parseInt(countStr);
          if (isNaN(count) || count <= 0 || count > 5) {
            console.log(warn("Jumlah swap harus antara 1 - 5."));
          } else {
            console.log(info(`\nJalankan swap sebanyak ${count} kali untuk semua wallet...`));
            for (let i = 0; i < PRIVATE_KEYS.length; i++) {
              await runWalletTasks(PRIVATE_KEYS[i], i, { swap: true, swapCount: count });
            }
          }
          askAgain();
        });
        return;

      case "3":
        console.log(info("\nJalankan provide liquidity untuk semua wallet..."));
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
          await runWalletTasks(PRIVATE_KEYS[i], i, { provide: true });
        }
        break;

      case "4":
        console.log(info("\nJalankan remove liquidity untuk semua wallet..."));
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
          await runWalletTasks(PRIVATE_KEYS[i], i, { remove: true });
        }
        break;

      case "5":
        console.log(info("\nJalankan semua fungsi untuk semua wallet..."));
        for (let i = 0; i < PRIVATE_KEYS.length; i++) {
          await runWalletTasks(PRIVATE_KEYS[i], i, {
            claim: true,
            swap: true,
            swapCount: 1,
            provide: true
          });
        }
        break;

      case "0":
        console.log(success("Keluar dari bot. Terima kasih!"));
        readline.close();
        return;

      default:
        console.log(warn("Pilihan tidak valid. Silakan coba lagi."));
    }
    askAgain();
  });
}

function askAgain() {
  readline.question("\nTekan Enter untuk kembali ke menu...", () => {
    showMenu();
  });
}

// === Start App ===
showMenu();