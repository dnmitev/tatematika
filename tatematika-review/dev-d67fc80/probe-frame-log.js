// Per-frame probe injected into page context
// Logs exact raw fields without ||0 masking
(function() {
  if (window.__frameLoggerInstalled) return;
  window.__frameLoggerInstalled = true;
  
  const logs = [];
  const startWallTime = performance.now();
  const maxDurationMs = 30000; // 30 seconds
  
  function captureFrame() {
    const wallMs = performance.now() - startWallTime;
    if (wallMs > maxDurationMs) return; // Stop after 30s
    
    const game = window.__tatematika?.getGame();
    if (!game) {
      requestAnimationFrame(captureFrame);
      return;
    }
    
    const scene = game.scene.getScene('GameScene');
    if (!scene) {
      requestAnimationFrame(captureFrame);
      return;
    }
    
    const loop = game.loop;
    const actionPhase = window.__tatematika.getActionPhase?.();
    
    const entry = {
      wallMs: wallMs,
      loopDelta: loop.delta,
      rawDelta: loop.rawDelta,
      actionPhase: actionPhase,
      actionLocked: scene.actionLocked,
      catIsJumping: scene.catIsJumping,
      catJumpTime: scene.catJumpTime,
      landingFrameTime: scene.landingFrameTime,
      popAnimationStartTime: scene.popAnimationStartTime,
      stars: scene.gameState?.stars,
      wrongAttempts: scene.gameState?.wrongAttempts
    };
    
    logs.push(entry);
    requestAnimationFrame(captureFrame);
  }
  
  requestAnimationFrame(captureFrame);
  
  // Export function to retrieve logs
  window.__getFrameLogs = () => logs;
})();
