const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/Users/folahan/.gemini/antigravity/brain/99326b85-b826-4218-8641-a77dcce35928/dashboard_glass_changes.png' });
    await browser.close();
})();
