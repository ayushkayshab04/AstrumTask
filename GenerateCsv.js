const { connect } = require("puppeteer-real-browser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// CSV Writer Setup (if you still want to write data to CSV)
const csvWriter = createCsvWriter({
  path: "top_traders.csv",
  header: [
    { id: "coin", title: "Coin Name" },
    { id: "walletAddress", title: "Wallet Address" },
  ],
});


const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Dexscreener URL
const BASE_URL = "https://dexscreener.com/solana?rankBy=trendingScoreH24&order=desc";

const scrapeTopMemeCoins = async () => {
  const { browser, page } = await connect({
    headless: false,
    args: [
      '--start-maximized', // Start with maximized window
      '--window-size=1920,1080', // Set window size
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
  });


  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 0.5,
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
    await page.waitForSelector(".ds-dex-table-row.ds-dex-table-row-top", {
        timeout: 10000, // Wait up to 10 seconds
      });
  }

  console.log("Extracting top 20 meme coins...");
  const coins = await page.evaluate(() => {
    const rows = Array.from(
      document.querySelectorAll(".ds-dex-table-row.ds-dex-table-row-top")
    );

    return rows.slice(0, 20).map((row) => {
      const coinName = row.querySelector(
        ".ds-table-data-cell.ds-dex-table-row-col-token .ds-dex-table-row-base-token-name-text"
      )?.textContent.trim();
      const coinLink = row.getAttribute("href");
      return {
        coinName: coinName || "Unknown Coin",
        Link: coinLink ? `https://dexscreener.com${coinLink}` : "",
      };
    });
  });

  if (coins.length === 0) {
    console.error("No coins found. Please check the selectors or page structure.");
    await page.screenshot({ path: "debug_no_coins_found.png" });
    return;
  }

  // console.log("ExtractedCoins:",coins)

  // Object to store coin names as keys and array of wallet addresses as values
  let topTradersData = {};

  for (const coin of coins) {
    console.log(`Fetching top traders for ${coin.coinName}...`);
    await page.goto(coin.Link, { waitUntil: 'networkidle2' });

    // Click on the "Top Traders" tab
    const buttonClicked = await page.evaluate(() => {
      const xpath = "//button[contains(text(), 'Top Traders')]";
      const button = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      if (button) {

        button.click()
        return true;
      }
      return false;
    });

    // console.log("=========ButtonClicked",buttonClicked)

    if (buttonClicked) {
      // console.log("Button clicked successfully.");
    } else {
      console.log(`Unable to click Top Traders button for ${coin.coinName}`);
      continue;
    }
    // Add delay to ensure data loads

    await page.waitForSelector(".custom-1kikirr",{
      waitUntil:'networkidle2'
    });


    // Scrape trader wallet addresses
    const traders = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".custom-1nvxwu0")).map((row) => {
        console.log("====Row",row)
          const explorerLink = row
            .querySelector('a[href*="solscan.io/account"]')
            ?.getAttribute("href");
          const walletAddress = explorerLink
            ? explorerLink.split("/account/")[1]
            : "";
          return walletAddress;
        })
        .filter(address => address !== ""); // Filter out empty addresses
    });

    // Add the traders to the result object
    topTradersData[coin.coinName] = traders;

    console.log(`Found ${traders.length} traders for ${coin.coinName}`);
    
    // Add a delay between coins to avoid rate limiting
    // await page.waitForTimeout(1000);
    await delay(5000)
  }

  // Optionally, write data to CSV if needed
  let allTraders = [];
  for (let coinName in topTradersData) {
    const traders = topTradersData[coinName];
    allTraders = [
      ...allTraders,
      ...traders.map((walletAddress) => ({
        coin: coinName,
        walletAddress,
      })),
    ];
  }

  console.log("Writing data to CSV...");
  await csvWriter.writeRecords(allTraders);

  console.log("Top traders successfully saved to top_traders.csv!");
  console.log("Top Traders Data:", topTradersData); // Optionally log the object
  await browser.close();
};

scrapeTopMemeCoins().catch((err) => {
  console.error("Error:", err.message);
});
