const { connect } = require("puppeteer-real-browser");
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
  const { browser, page } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });

  console.log("Navigating to Dexscreener...");
  await page.goto(BASE_URL);

  // Wait for the table to load
  console.log("Waiting for the table to load...");
  try {
    await page.waitForSelector(".ds-dex-table-row.ds-dex-table-row-top", {
      timeout: 10000, // Wait up to 10 seconds
    });
  } catch (error) {
    console.error("Table rows not found within the timeout period.");
    await page.screenshot({ path: "debug_table_load_failure.png" });
    await page.waitForSelector(".ds-dex-table-row.ds-dex-table-row-top", {
        timeout: 10000, // Wait up to 10 seconds
      });
    // await browser.close();
    // return;
  }

  console.log("Extracting top 20 meme coins...");
  const coins = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll(".ds-dex-table-row.ds-dex-table-row-top")
    );

    console.log("Rows found:", rows.length); // Debugging

    return rows.slice(0, 20).map((row) => {
      const coinName = row.querySelector(
        ".ds-table-data-cell.ds-dex-table-row-col-token .ds-dex-table-row-base-token-name-text"
      )?.textContent.trim();

      const coinLink = row.querySelector("a")?.getAttribute("href");

      return {
        coinName: coinName || "Unknown Coin",
        coinLink: coinLink ? `https://dexscreener.com${coinLink}` : "",
      };
    });
  });

  if (coins.length === 0) {
    console.error("No coins found. Please check the selectors or page structure.");
    await page.screenshot({ path: "debug_no_coins_found.png" });
    await browser.close();
    return;
  }

  console.log("Extracted Coins:", coins);

  let allTraders = [];

  for (const coin of coins) {
    console.log(`Fetching top traders for ${coin.coinName}...`);
    await page.goto(coin.coinLink, { waitUntil: "networkidle2" });

    // Click on the "Top Traders" tab
    const topTradersButton = await page.$x("//button[contains(text(), 'Top Traders')]");
    if (topTradersButton.length > 0) {
      await topTradersButton[0].click();
    } else {
      console.log(`Top Traders button not found for ${coin.coinName}`);
      continue;
    }

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
