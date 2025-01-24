const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// CSV Writer Setup
const csvWriter = createCsvWriter({
  path: "top_traders.csv",
  header: [
    { id: "coin", title: "Coin Name" },
    { id: "walletAddress", title: "Wallet Address" },
  ],
});

// Dexscreener URL
const BASE_URL = "https://dexscreener.com/solana?rankBy=trendingScoreH24&order=desc";

const scrapeTopMemeCoins = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set User-Agent to prevent blocking
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  console.log("Navigating to Dexscreener...");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });

  console.log("Extracting top 20 meme coins...");
  const coins = await page.evaluate(() => {
    // Select all rows in the table
    const rows = Array.from(
      document.querySelectorAll(".ds-dex-table-row.ds-dex-table-row-top")
    );
    console.log("======+Rows",rows)

    // Extract top 20 rows
    return rows.slice(0, 20).map((row) => {
      const coinName = row.querySelector(
        ".ds-table-data-cell.ds-dex-table-row-col-token .ds-dex-table-row-base-token-name-text"
      )?.textContent.trim();

      const coinLink = row.getAttribute("href");

      return {
        coinName: coinName || "Unknown Coin",
        coinLink: `https://dexscreener.com${coinLink}`,
      };
    });
  });

  console.log("Extracted Coins:", coins);

  let allTraders = [];

  for (const coin of coins) {
    console.log(`Fetching top traders for ${coin.coinName}...`);
    await page.goto(coin.coinLink, { waitUntil: "networkidle2" });

    // Click on the "Top Traders" tab
    await page.click('button:contains("Top Traders")');

    // Wait for the top traders table to load
    await page.waitForSelector("#topTradersTable tbody");

    // Scrape trader wallet addresses
    const traders = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("#topTradersTable tbody tr")).map(
        (row) => {
          const explorerLink = row
            .querySelector('a[href*="solscan.io/account"]')
            ?.getAttribute("href");
          const walletAddress = explorerLink
            ? explorerLink.split("/account/")[1]
            : "";

          return walletAddress;
        }
      );
    });

    // Add the traders to the result
    allTraders = [
      ...allTraders,
      ...traders.map((walletAddress) => ({
        coin: coin.coinName,
        walletAddress,
      })),
    ];
  }

  console.log("Writing data to CSV...");
  await csvWriter.writeRecords(allTraders);

  console.log("Top traders successfully saved to top_traders.csv!");
  await browser.close();
};

scrapeTopMemeCoins().catch((err) => {
  console.error("Error:", err.message);
});
