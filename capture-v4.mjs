import { chromium } from '@playwright/test';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  
  // Desktop 5 balloons
  const desktop = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await desktop.goto('http://localhost:5178');
  await desktop.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await desktop.evaluate(() => {
    localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
      upperLimit: 20,
      operations: 'both',
      balloonCount: 5,
      correctBalloonsPerLevel: 5,
      balloonSpeed: 'slow'
    }));
  });
  await desktop.reload();
  await desktop.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: '/opt/cursor/artifacts/v4-desktop-5balloons-upperLimit20.png' });
  await desktop.close();
  
  // Mobile 320 - 3 balloons
  const mobile320_3 = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await mobile320_3.goto('http://localhost:5178');
  await mobile320_3.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await mobile320_3.evaluate(() => {
    localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
      upperLimit: 20,
      operations: 'both',
      balloonCount: 3,
      correctBalloonsPerLevel: 5,
      balloonSpeed: 'slow'
    }));
  });
  await mobile320_3.reload();
  await mobile320_3.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await mobile320_3.waitForTimeout(800);
  await mobile320_3.screenshot({ path: '/opt/cursor/artifacts/v4-mobile-320-3balloons-upperLimit20.png' });
  await mobile320_3.close();
  
  // Mobile 320 - 5 balloons
  const mobile320_5 = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await mobile320_5.goto('http://localhost:5178');
  await mobile320_5.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await mobile320_5.evaluate(() => {
    localStorage.setItem('tatematika-kote-balonche-settings', JSON.stringify({
      upperLimit: 20,
      operations: 'both',
      balloonCount: 5,
      correctBalloonsPerLevel: 5,
      balloonSpeed: 'slow'
    }));
  });
  await mobile320_5.reload();
  await mobile320_5.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await mobile320_5.waitForTimeout(800);
  await mobile320_5.screenshot({ path: '/opt/cursor/artifacts/v4-mobile-320-5balloons-upperLimit20.png' });
  await mobile320_5.close();
  
  await browser.close();
  console.log('Screenshots captured with upperLimit=20');
}

capture().catch(console.error);
