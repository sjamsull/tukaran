# Tukaran Bot - Testnet Interaction Tool

Bot interaktif untuk menjalankan beberapa fungsi blockchain testnet seperti klaim faucet, swap token, provide/remove liquidity, dll.

Dibuat oleh [sjamsull](https://github.com/sjamsull)

---

## 🚀 Fitur Utama

- Klaim faucet token dari kontrak
- Swap antara `hDEFI` ↔ Token Lain (WETH, CRV, SUSHI, UNI, USDC)
- Provide & Remove Liquidity
- Menu CLI interaktif
- Warna-warni + emoji di terminal 🎨✨
- Semua wallet dijalankan otomatis

---

## 🧰 Kebutuhan Sistem

- Node.js v18+ (direkomendasikan)
- NPM
- Wallet Ethereum (untuk private key)
- RPC URL dari jaringan testnet (misal: Optimism Sepolia)

---

## 📦 Instalasi

1. Clone repo:
   ```bash
   git clone https://github.com/sjamsull/tukaran.git

   cd tukaran

   npm install chalk@4.1.0 ora dotenv ethers

buat file .env untuk menyimpan private key.
kalau di termux bisa pakai command nano .env
masukkan private key dengan format PRIVATE_KEYS=979xxxxxxx
pastikan private key aman


untuk menjalankan
   ```bash
   node gaskan.js

Keamanan
Private key hanya disimpan di file .env dan tidak pernah dikirim kemana-mana.
File .env sudah diabaikan oleh Git (gitignore).
Jangan pernah share file .env 