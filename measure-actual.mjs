import { chromium } from '@playwright/test';

async function measure() {
  const browser = await chromium.launch({ headless: true });
  
  // Start dev server check
  console.log('Testing connection...');
  
  // Desktop 800x600
  console.log('\n=== DESKTOP 800x600 ===');
  const desktop = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await desktop.goto('http://localhost:5177');
  await desktop.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await desktop.waitForTimeout(500);
  
  const desktopMeasure = await desktop.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const hook = window.__tatematika;
    const state = hook.getGameState();
    const firstBalloon = state.balloons[0];
    const bounds = hook.getBalloonBounds(firstBalloon.id);
    const formulaSize = hook.getFormulaFontSize();
    const targetSize = hook.getTargetFontSize();
    
    return {
      canvasSize: canvasRect ? { width: canvasRect.width, height: canvasRect.height } : null,
      gameState: { width: 800, height: 600 },
      scale: canvasRect ? canvasRect.width / 800 : null,
      formulaFontSizeHook: formulaSize,
      targetFontSizeHook: targetSize,
      balloonBounds: bounds,
      balloonBoundsCSS: bounds ? {
        width: bounds.width * (canvasRect.width / 800),
        height: bounds.height * (canvasRect.width / 800)
      } : null
    };
  });
  console.log(JSON.stringify(desktopMeasure, null, 2));
  await desktop.close();
  
  // Mobile 320x568
  console.log('\n=== MOBILE 320x568 ===');
  const mobile = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await mobile.goto('http://localhost:5177');
  await mobile.waitForFunction(() => window.__tatematika !== undefined, { timeout: 5000 });
  await mobile.waitForTimeout(500);
  
  const mobileMeasure = await mobile.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const hook = window.__tatematika;
    const state = hook.getGameState();
    const firstBalloon = state.balloons[0];
    const bounds = hook.getBalloonBounds(firstBalloon.id);
    const formulaSize = hook.getFormulaFontSize();
    const targetSize = hook.getTargetFontSize();
    
    return {
      canvasSize: canvasRect ? { width: canvasRect.width, height: canvasRect.height } : null,
      gameState: { width: 800, height: 600 },
      scale: canvasRect ? canvasRect.width / 800 : null,
      formulaFontSizeHook: formulaSize,
      targetFontSizeHook: targetSize,
      balloonBounds: bounds,
      balloonBoundsCSS: bounds ? {
        width: bounds.width * (canvasRect.width / 800),
        height: bounds.height * (canvasRect.width / 800)
      } : null
    };
  });
  console.log(JSON.stringify(mobileMeasure, null, 2));
  await mobile.close();
  
  await browser.close();
}

measure().catch(console.error);
