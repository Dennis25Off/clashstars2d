import React, { useEffect, useRef, useState } from 'react';
import {
  Shield,
  Zap,
  Flame,
  Crosshair,
  Gamepad2,
  Keyboard,
  Smartphone,
  Eye,
  EyeOff,
} from 'lucide-react';
import { GameEngine } from '../game/GameEngine';
import { PhaserGameBridge } from '../phaser/PhaserGameBridge';
import { BRAWLERS } from '../data/brawlers';
import { ControlsConfig, DEFAULT_CONTROLS_CONFIG, KillFeedEntry } from '../types/game';
import { ControlsMappingModal } from './ControlsMappingModal';
import { sound } from '../utils/audio';

interface GameHUDProps {
  engine: GameEngine | PhaserGameBridge;
  aliveCount: number;
  playerHp: number;
  playerMaxHp: number;
  playerAmmo: number;
  playerSuperCharge: number;
  powerCubes: number;
  gadgetCharges?: number;
  killFeed: KillFeedEntry[];
  poisonPhase: number;
  poisonTimer: number;
  pingMs?: number;
  currentZoom?: number;
  fovMode?: 'normal' | 'wide' | 'ultra';
  roomId?: string;
  controlsConfig?: ControlsConfig;
  onUpdateControlsConfig?: (config: ControlsConfig) => void;
  onExitMatch: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  engine,
  aliveCount,
  playerHp,
  playerMaxHp,
  playerAmmo,
  playerSuperCharge,
  powerCubes,
  gadgetCharges,
  killFeed,
  poisonPhase,
  poisonTimer,
  pingMs = 24,
  currentZoom = 0.65,
  fovMode = 'wide',
  roomId = 'CS-DEFAULT',
  controlsConfig: externalConfig,
  onUpdateControlsConfig,
  onExitMatch,
}) => {
  const leftTouchRef = useRef<HTMLDivElement>(null);
  const rightTouchRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  // Local controls configuration with fallback
  const [controls, setControls] = useState<ControlsConfig>(() => ({
    ...DEFAULT_CONTROLS_CONFIG,
    ...(externalConfig || {}),
  }));

  const controlsRef = useRef<ControlsConfig>(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  // Sync external changes
  useEffect(() => {
    if (externalConfig) {
      setControls((prev) => {
        const next = { ...prev, ...externalConfig };
        controlsRef.current = next;
        return next;
      });
    }
  }, [externalConfig]);

  const updateControls = (newCfg: ControlsConfig) => {
    controlsRef.current = newCfg;
    setControls(newCfg);
    if (onUpdateControlsConfig) {
      onUpdateControlsConfig(newCfg);
    }
  };

  // State for opening Controls Mapping Modal in-game
  const [showMappingModal, setShowMappingModal] = useState(false);

  // Live keyboard and mouse press states for visual key highlight
  const [activeKeys, setActiveKeys] = useState<{
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    f: boolean;
    space: boolean;
    e: boolean;
    r: boolean;
    q: boolean;
    leftClick: boolean;
    rightClick: boolean;
  }>({
    w: false,
    a: false,
    s: false,
    d: false,
    f: false,
    space: false,
    e: false,
    r: false,
    q: false,
    leftClick: false,
    rightClick: false,
  });

  // Touch identifiers tracking for multitouch
  const leftTouchIdRef = useRef<number | null>(null);
  const rightTouchIdRef = useRef<number | null>(null);
  const rightTouchStartTime = useRef<number>(0);

  // D-Pad active directions (for tactile on-screen D-Pad mode)
  const dpadDirectionsRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const [dpadActive, setDpadActive] = useState({ up: false, down: false, left: false, right: false });

  // Left joystick ref & visual state
  const leftStickRef = useRef<{
    active: boolean;
    centerX: number;
    centerY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    centerX: 0,
    centerY: 0,
    currX: 0,
    currY: 0,
  });

  const [leftStick, setLeftStick] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
  });

  // Right attack joystick ref & visual state
  const rightStickRef = useRef<{
    active: boolean;
    centerX: number;
    centerY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    centerX: 0,
    centerY: 0,
    currX: 0,
    currY: 0,
  });

  const [rightStick, setRightStick] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
  });

  // Super touch drag stick ref & visual state
  const superTouchRef = useRef<HTMLButtonElement>(null);
  const superTouchIdRef = useRef<number | null>(null);
  const superTouchStartTime = useRef<number>(0);
  const superStickRef = useRef<{
    active: boolean;
    centerX: number;
    centerY: number;
    currX: number;
    currY: number;
  }>({
    active: false,
    centerX: 0,
    centerY: 0,
    currX: 0,
    currY: 0,
  });

  const [superStick, setSuperStick] = useState<{
    active: boolean;
    currX: number;
    currY: number;
  }>({
    active: false,
    currX: 0,
    currY: 0,
  });

  const isSuperReady = playerSuperCharge >= 100;

  // --- DESKTOP KEYBOARD & MOUSE CONTROLS ---
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys[k] = true;

      // Update live visual indicators
      setActiveKeys((prev) => ({
        ...prev,
        w: !!(keys['w'] || keys['arrowup']),
        a: !!(keys['a'] || keys['arrowleft']),
        s: !!(keys['s'] || keys['arrowdown']),
        d: !!(keys['d'] || keys['arrowright']),
        f: !!keys['f'],
        space: !!keys[' '],
        e: !!keys['e'],
        r: !!keys['r'],
        q: !!keys['q'],
      }));

      updateKeyboardMovement();

      if (e.key === ' ' || k === 'r') {
        engine.firePlayerSuper();
      } else if (k === 'e' || k === 'q') {
        engine.usePlayerGadget();
      } else if (k === 'f') {
        engine.firePlayerNormalAttack();
      } else if (k === 'tab' || k === 'h') {
        e.preventDefault();
        setShowMappingModal((prev) => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys[k] = false;

      setActiveKeys((prev) => ({
        ...prev,
        w: !!(keys['w'] || keys['arrowup']),
        a: !!(keys['a'] || keys['arrowleft']),
        s: !!(keys['s'] || keys['arrowdown']),
        d: !!(keys['d'] || keys['arrowright']),
        f: !!keys['f'],
        space: !!keys[' '],
        e: !!keys['e'],
        r: !!keys['r'],
        q: !!keys['q'],
      }));

      updateKeyboardMovement();
    };

    const updateKeyboardMovement = () => {
      let dx = 0;
      let dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (keys['a'] || keys['arrowleft']) dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;

      // Also merge with D-Pad touch if active
      if (dpadDirectionsRef.current.up) dy -= 1;
      if (dpadDirectionsRef.current.down) dy += 1;
      if (dpadDirectionsRef.current.left) dx -= 1;
      if (dpadDirectionsRef.current.right) dx += 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }
      engine.moveVector = { x: dx, y: dy };
    };

    const handleMouseMove = () => {
      // Phaser's canvas pointer listeners track world-space mouse aiming and rotation accurately
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        setActiveKeys((p) => ({ ...p, leftClick: true }));
      } else if (e.button === 2) {
        setActiveKeys((p) => ({ ...p, rightClick: true }));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) setActiveKeys((p) => ({ ...p, leftClick: false }));
      if (e.button === 2) setActiveKeys((p) => ({ ...p, rightClick: false }));
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [engine]);

  // --- NATIVE MULTITOUCH CONTROLS (INDEPENDENT IDENTIFIER TRACKING) ---
  useEffect(() => {
    const onWindowTouchMove = (e: TouchEvent) => {
      // 1. Process Left Stick if its touch identifier is active
      if (leftTouchIdRef.current !== null && leftTouchRef.current && leftStickRef.current.active) {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === leftTouchIdRef.current) {
            const rect = leftTouchRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const touchX = t.clientX - rect.left;
            const touchY = t.clientY - rect.top;

            const dx = touchX - centerX;
            const dy = touchY - centerY;
            const dist = Math.hypot(dx, dy);
            const maxRadius = 55;
            const normDist = Math.min(dist, maxRadius);
            const angle = Math.atan2(dy, dx);

            const clampedX = centerX + Math.cos(angle) * normDist;
            const clampedY = centerY + Math.sin(angle) * normDist;

            leftStickRef.current.currX = clampedX;
            leftStickRef.current.currY = clampedY;
            setLeftStick((prev) => ({ ...prev, currX: clampedX, currY: clampedY }));

            const moveX = (Math.cos(angle) * normDist) / maxRadius;
            const moveY = (Math.sin(angle) * normDist) / maxRadius;
            engine.moveVector = { x: moveX, y: moveY };

            // Set visual active direction keys
            setActiveKeys((prev) => ({
              ...prev,
              w: dy < -12,
              s: dy > 12,
              a: dx < -12,
              d: dx > 12,
            }));
            break;
          }
        }
      }

      // 2. Process Right Stick if its touch identifier is active
      if (rightTouchIdRef.current !== null && rightTouchRef.current && rightStickRef.current.active) {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === rightTouchIdRef.current) {
            const rect = rightTouchRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const touchX = t.clientX - rect.left;
            const touchY = t.clientY - rect.top;

            const dx = touchX - centerX;
            const dy = touchY - centerY;
            const rawDist = Math.hypot(dx, dy);

            const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
            const scaledDx = dx * sensitivity;
            const scaledDy = dy * sensitivity;
            const scaledDist = Math.hypot(scaledDx, scaledDy);
            const maxRadius = 55;
            const normDist = Math.min(scaledDist, maxRadius);
            const angle = Math.atan2(scaledDy, scaledDx);

            const clampedX = centerX + (scaledDist > 0 ? (scaledDx / scaledDist) * normDist : 0);
            const clampedY = centerY + (scaledDist > 0 ? (scaledDy / scaledDist) * normDist : 0);

            rightStickRef.current.currX = clampedX;
            rightStickRef.current.currY = clampedY;
            setRightStick((prev) => ({ ...prev, currX: clampedX, currY: clampedY }));

            const deadzone = Math.max(6, Math.round(14 / Math.max(0.4, sensitivity)));
            if (rawDist > deadzone) {
              engine.aimVector.x = Math.cos(angle);
              engine.aimVector.y = Math.sin(angle);
              engine.aimVector.isAiming = true;
            }
            break;
          }
        }
      }

      // 3. Process Super Stick if its touch identifier is active
      if (superTouchIdRef.current !== null && superTouchRef.current && superStickRef.current.active) {
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === superTouchIdRef.current) {
            const rect = superTouchRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const touchX = t.clientX - rect.left;
            const touchY = t.clientY - rect.top;

            const dx = touchX - centerX;
            const dy = touchY - centerY;
            const rawDist = Math.hypot(dx, dy);

            const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
            const scaledDx = dx * sensitivity;
            const scaledDy = dy * sensitivity;
            const scaledDist = Math.hypot(scaledDx, scaledDy);
            const maxRadius = 45;
            const normDist = Math.min(scaledDist, maxRadius);
            const angle = Math.atan2(scaledDy, scaledDx);

            const clampedX = centerX + (scaledDist > 0 ? (scaledDx / scaledDist) * normDist : 0);
            const clampedY = centerY + (scaledDist > 0 ? (scaledDy / scaledDist) * normDist : 0);

            superStickRef.current.currX = clampedX;
            superStickRef.current.currY = clampedY;
            setSuperStick({ active: true, currX: clampedX, currY: clampedY });

            const deadzone = Math.max(6, Math.round(12 / Math.max(0.4, sensitivity)));
            if (rawDist > deadzone) {
              engine.aimVector.x = Math.cos(angle);
              engine.aimVector.y = Math.sin(angle);
              engine.aimVector.isSuperAiming = true;
            }
            break;
          }
        }
      }
    };

    const onWindowTouchEnd = (e: TouchEvent) => {
      // Check if left touch ended
      if (leftTouchIdRef.current !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === leftTouchIdRef.current) {
            leftTouchIdRef.current = null;
            leftStickRef.current.active = false;
            setLeftStick({ active: false, startX: 0, startY: 0, currX: 0, currY: 0 });
            engine.moveVector = { x: 0, y: 0 };
            setActiveKeys((p) => ({ ...p, w: false, s: false, a: false, d: false }));
            break;
          }
        }
      }

      // Check if right touch ended
      if (rightTouchIdRef.current !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === rightTouchIdRef.current) {
            rightTouchIdRef.current = null;
            rightStickRef.current.active = false;
            const duration = Date.now() - rightTouchStartTime.current;
            const rect = rightTouchRef.current?.getBoundingClientRect();
            const centerX = rect ? rect.width / 2 : 0;
            const centerY = rect ? rect.height / 2 : 0;
            const dx = rightStickRef.current.currX - centerX;
            const dy = rightStickRef.current.currY - centerY;
            const dist = Math.hypot(dx, dy);

            const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
            const deadzone = Math.max(8, Math.round(18 / Math.max(0.4, sensitivity)));

            if (dist < deadzone || duration < 190) {
              // Quick tap: Auto-aim!
              engine.firePlayerNormalAttack();
            } else {
              // Drag release: Fire in aimed direction!
              const angle = Math.atan2(dy, dx);
              engine.firePlayerNormalAttack(angle);
            }

            setRightStick({ active: false, startX: 0, startY: 0, currX: 0, currY: 0 });
            engine.aimVector.isAiming = false;
            break;
          }
        }
      }

      // Check if super touch ended
      if (superTouchIdRef.current !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === superTouchIdRef.current) {
            superTouchIdRef.current = null;
            superStickRef.current.active = false;
            const duration = Date.now() - superTouchStartTime.current;
            const rect = superTouchRef.current?.getBoundingClientRect();
            const centerX = rect ? rect.width / 2 : 0;
            const centerY = rect ? rect.height / 2 : 0;
            const dx = superStickRef.current.currX - centerX;
            const dy = superStickRef.current.currY - centerY;
            const dist = Math.hypot(dx, dy);

            const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
            const deadzone = Math.max(8, Math.round(16 / Math.max(0.4, sensitivity)));

            if (dist < deadzone || duration < 190) {
              // Quick tap: Auto-aim Super!
              engine.firePlayerSuper();
            } else {
              // Drag release: Fire aimed Super in direction!
              const angle = Math.atan2(dy, dx);
              engine.firePlayerSuper(angle);
            }

            setSuperStick({ active: false, currX: 0, currY: 0 });
            engine.aimVector.isSuperAiming = false;
            break;
          }
        }
      }
    };

    window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
    window.addEventListener('touchend', onWindowTouchEnd);
    window.addEventListener('touchcancel', onWindowTouchEnd);

    return () => {
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowTouchEnd);
      window.removeEventListener('touchcancel', onWindowTouchEnd);
    };
  }, [engine]);

  // Touch handlers attached directly to joystick zones
  const handleLeftTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (leftTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    leftTouchIdRef.current = touch.identifier;

    const rect = leftTouchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const dx = touchX - centerX;
    const dy = touchY - centerY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 55;
    const normDist = Math.min(dist, maxRadius);
    const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
    const currX = centerX + Math.cos(angle) * normDist;
    const currY = centerY + Math.sin(angle) * normDist;

    leftStickRef.current = { active: true, centerX, centerY, currX, currY };
    setLeftStick({ active: true, startX: centerX, startY: centerY, currX, currY });

    if (dist > 8) {
      engine.moveVector = {
        x: (Math.cos(angle) * normDist) / maxRadius,
        y: (Math.sin(angle) * normDist) / maxRadius,
      };
    }
  };

  const handleRightTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (rightTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    rightTouchIdRef.current = touch.identifier;
    rightTouchStartTime.current = Date.now();

    const rect = rightTouchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const dx = touchX - centerX;
    const dy = touchY - centerY;
    const rawDist = Math.hypot(dx, dy);

    const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
    const scaledDx = dx * sensitivity;
    const scaledDy = dy * sensitivity;
    const scaledDist = Math.hypot(scaledDx, scaledDy);
    const maxRadius = 55;
    const normDist = Math.min(scaledDist, maxRadius);
    const angle = scaledDist > 0 ? Math.atan2(scaledDy, scaledDx) : 0;
    const currX = centerX + (scaledDist > 0 ? (scaledDx / scaledDist) * normDist : 0);
    const currY = centerY + (scaledDist > 0 ? (scaledDy / scaledDist) * normDist : 0);

    rightStickRef.current = { active: true, centerX, centerY, currX, currY };
    setRightStick({ active: true, startX: centerX, startY: centerY, currX, currY });
    engine.aimVector.isAiming = true;
    const deadzone = Math.max(6, Math.round(14 / Math.max(0.4, sensitivity)));
    if (rawDist > deadzone) {
      engine.aimVector.x = Math.cos(angle);
      engine.aimVector.y = Math.sin(angle);
    }
  };

  const handleSuperTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSuperReady) return;
    if (superTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    superTouchIdRef.current = touch.identifier;
    superTouchStartTime.current = Date.now();

    const rect = superTouchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    const dx = touchX - centerX;
    const dy = touchY - centerY;
    const rawDist = Math.hypot(dx, dy);

    const sensitivity = controlsRef.current.touchAimSensitivity ?? 1.0;
    const scaledDx = dx * sensitivity;
    const scaledDy = dy * sensitivity;
    const scaledDist = Math.hypot(scaledDx, scaledDy);
    const maxRadius = 45;
    const normDist = Math.min(scaledDist, maxRadius);
    const angle = scaledDist > 0 ? Math.atan2(scaledDy, scaledDx) : 0;
    const currX = centerX + (scaledDist > 0 ? (scaledDx / scaledDist) * normDist : 0);
    const currY = centerY + (scaledDist > 0 ? (scaledDy / scaledDist) * normDist : 0);

    superStickRef.current = { active: true, centerX, centerY, currX, currY };
    setSuperStick({ active: true, currX, currY });
    engine.aimVector.isSuperAiming = true;
    const deadzone = Math.max(6, Math.round(12 / Math.max(0.4, sensitivity)));
    if (rawDist > deadzone) {
      engine.aimVector.x = Math.cos(angle);
      engine.aimVector.y = Math.sin(angle);
    }
  };

  // Dedicated D-Pad Handlers (for mobile & desktop click/touch)
  const setDpadDirection = (dir: 'up' | 'down' | 'left' | 'right', pressed: boolean) => {
    dpadDirectionsRef.current[dir] = pressed;
    setDpadActive({ ...dpadDirectionsRef.current });

    let dx = 0;
    let dy = 0;
    if (dpadDirectionsRef.current.up) dy -= 1;
    if (dpadDirectionsRef.current.down) dy += 1;
    if (dpadDirectionsRef.current.left) dx -= 1;
    if (dpadDirectionsRef.current.right) dx += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }
    engine.moveVector = { x: dx, y: dy };
  };

  // Minimap rendering loop
  useEffect(() => {
    let animId: number;
    const renderMinimap = () => {
      const canvas = minimapCanvasRef.current;
      if (canvas && engine) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const mapSize = 2400;
          const scale = canvas.width / mapSize;

          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Poison ring
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(
            engine.poisonZone.centerX * scale,
            engine.poisonZone.centerY * scale,
            engine.poisonZone.currentRadius * scale,
            0,
            Math.PI * 2
          );
          ctx.stroke();

          // Obstacles
          ctx.fillStyle = '#334155';
          for (const obs of engine.obstacles) {
            ctx.fillRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
          }

          // Brawlers
          for (const b of engine.brawlers) {
            if (!b.isAlive) continue;
            if (b.isPlayer) {
              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(b.x * scale, b.y * scale, 3.5, 0, Math.PI * 2);
              ctx.fill();
            } else if (!b.isInBush || engine.player.isInBush) {
              if (b.isRemotePlayer) {
                // Real human opponent: bright gold with outline on minimap
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.arc(b.x * scale, b.y * scale, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
              } else {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(b.x * scale, b.y * scale, 2.5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }
      animId = requestAnimationFrame(renderMinimap);
    };

    renderMinimap();
    return () => cancelAnimationFrame(animId);
  }, [engine]);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-2 sm:p-4 select-none touch-none overflow-hidden font-['Outfit',sans-serif]">
      {/* TOP BAR: Alive Brawlers, Power Cubes, Poison Storm Banner, FOV Controls, Ping, Minimap, Key Mapping Modal Button & Exit */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between w-full gap-2">
        {/* Left: Alive count, Power Cubes & Multiplayer Ping Status */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Alive count pill */}
          <div className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-slate-900/90 border-2 border-slate-700 shadow-xl backdrop-blur-md">
            <span className="text-sm sm:text-base">💀</span>
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase leading-none">VIVI</span>
              <span className="font-black text-xs sm:text-base text-white font-game leading-tight">
                {aliveCount} <span className="text-[9px] text-slate-400">/ 10</span>
              </span>
            </div>
          </div>

          {/* Power Cubes badge */}
          <div className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-2xl bg-emerald-950/90 border-2 border-emerald-500 shadow-xl backdrop-blur-md">
            <span className="text-sm sm:text-base">⚡</span>
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] text-emerald-400 font-bold uppercase leading-none">CUBI</span>
              <span className="font-black text-xs sm:text-base text-emerald-300 font-game leading-tight">
                {powerCubes}
              </span>
            </div>
          </div>

          {/* Multiplayer Live Server Status & Ping Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/85 border border-slate-700 shadow-md backdrop-blur-md text-[9px] sm:text-[10px] text-slate-300">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
            <span className="font-black text-emerald-400">{pingMs}ms</span>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-slate-300 font-bold hidden sm:inline">{roomId}</span>
          </div>

          {/* Kill Feed (compact with platform indicators) */}
          <div className="hidden lg:flex flex-col gap-1 max-w-[210px]">
            {killFeed.slice(-2).map((k) => (
              <div
                key={k.id}
                className="px-2 py-0.5 rounded-lg bg-black/60 text-[10px] text-slate-200 border-l-2 border-red-500 flex items-center gap-1 backdrop-blur-sm"
              >
                <span className="text-[9px]">{k.killerPlatform === 'pc' ? '💻' : '📱'}</span>
                <span className="font-bold text-amber-300 truncate max-w-[70px]">{k.killerName}</span>
                <span className="text-red-400 text-[10px]">⚡</span>
                <span className="text-[9px]">{k.victimPlatform === 'pc' ? '💻' : '📱'}</span>
                <span className="font-bold text-slate-300 truncate max-w-[70px]">{k.victimName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: FOV Controls, Key Mapping Modal trigger, Visible Keys Toggle, Minimap and Exit button */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* FOV Controls Pill (Requested: "aumenta il fov del giocatore") */}
          <div className="flex items-center bg-slate-900/90 border-2 border-indigo-400/80 rounded-xl shadow-md backdrop-blur-md overflow-hidden">
            <button
              onClick={() => {
                sound.playClick();
                const nextMode = fovMode === 'wide' ? 'ultra' : fovMode === 'ultra' ? 'normal' : 'wide';
                engine.setFovMode(nextMode);
              }}
              title="Cambia Ampiezza Visuale FOV (Normale / Ampio / Ultra)"
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] sm:text-xs font-black text-indigo-300 hover:bg-indigo-600/30 transition active:scale-95"
            >
              <span>👁️</span>
              <span className="hidden sm:inline font-bold">FOV:</span>
              <span className="uppercase text-amber-300 font-black">
                {fovMode === 'ultra' ? 'Ultra (0.5x)' : fovMode === 'normal' ? 'Normale (0.8x)' : 'Ampio (0.65x)'}
              </span>
            </button>
            <button
              onClick={() => {
                sound.playClick();
                engine.adjustZoom(-0.05); // Zoom out = wider FOV
              }}
              title="Aumenta campo visivo (Zoom out)"
              className="px-1.5 py-1 text-slate-300 hover:bg-slate-700/60 font-black text-xs border-l border-indigo-500/40"
            >
              −
            </button>
            <button
              onClick={() => {
                sound.playClick();
                engine.adjustZoom(0.05); // Zoom in
              }}
              title="Riduci campo visivo (Zoom in)"
              className="px-1.5 py-1 text-slate-300 hover:bg-slate-700/60 font-black text-xs border-l border-indigo-500/40"
            >
              +
            </button>
          </div>

          {/* Minimap */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-0.5 shadow-lg backdrop-blur-md">
            <canvas ref={minimapCanvasRef} width={56} height={56} className="rounded-lg block" />
          </div>

          {/* Exit button */}
          <button
            onClick={onExitMatch}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-red-900/80 border border-slate-600 text-[10px] sm:text-[11px] font-bold text-slate-200 active:scale-95 transition"
          >
            Esci
          </button>
        </div>
      </div>

      {/* Active Power-Ups Banner */}
      <div className="flex flex-col items-center justify-end w-full pb-1 pointer-events-none">
        <div className="flex items-center gap-2">
          {engine.player.speedBoostTimer > 0 && (
            <div className="px-2.5 py-0.5 rounded-lg bg-sky-950/80 border border-sky-400 text-sky-300 font-black text-[10px] shadow-lg animate-pulse flex items-center gap-1 backdrop-blur-sm">
              <span>⚡ VELOCITÀ</span>
              <span className="text-white bg-sky-600 px-1 rounded text-[9px]">
                {Math.ceil(engine.player.speedBoostTimer)}s
              </span>
            </div>
          )}

          {engine.player.shieldTimer > 0 && (
            <div className="px-2.5 py-0.5 rounded-lg bg-purple-950/80 border border-purple-400 text-purple-300 font-black text-[10px] shadow-lg animate-pulse flex items-center gap-1 backdrop-blur-sm">
              <span>🛡️ SCUDO -70%</span>
              <span className="text-white bg-purple-600 px-1 rounded text-[9px]">
                {Math.ceil(engine.player.shieldTimer)}s
              </span>
            </div>
          )}

          {engine.player.doubleDamageTimer > 0 && (
            <div className="px-2.5 py-0.5 rounded-lg bg-red-950/80 border border-red-500 text-red-300 font-black text-[10px] shadow-lg animate-pulse flex items-center gap-1 backdrop-blur-sm">
              <span>💥 DOPPIO DANNO</span>
              <span className="text-white bg-red-600 px-1 rounded text-[9px]">
                {Math.ceil(engine.player.doubleDamageTimer)}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLS BAR: Left Movement (Joystick OR D-Pad with Visible Keys), Gadget, Super Button, Right Combat */}
      <div className="flex items-end justify-between w-full pb-1 sm:pb-3 pointer-events-none">
        {/* LEFT CONTROLS: Movement with Visible WASD Keys (Multi-Touch Enabled) */}
        <div className="relative pointer-events-auto flex items-end gap-2">
          {controls.mobileMoveMode === 'joystick' ? (
            /* --- VIRTUAL JOYSTICK MODE WITH VISIBLE PERIMETER KEYS --- */
            <div
              ref={leftTouchRef}
              onTouchStart={handleLeftTouchStart}
              className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-900/60 border-2 border-sky-400/50 backdrop-blur-xs touch-none flex items-center justify-center shrink-0 shadow-lg"
            >
              {/* Visible WASD Key Badges on the joystick perimeter (Non-blocking visual guides) */}
              {controls.showVisibleKeys && (
                <>
                  {/* W Key (Top) */}
                  <div
                    className={`absolute top-0.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-lg border-2 font-black text-[10px] sm:text-xs shadow-md transition-all pointer-events-none ${
                      activeKeys.w || dpadActive.up
                        ? 'bg-sky-400 border-white text-slate-950 scale-125 shadow-sky-400/80 ring-2 ring-white'
                        : 'bg-slate-900/95 border-sky-400/80 text-sky-200'
                    }`}
                  >
                    W ▲
                  </div>

                  {/* S Key (Bottom) */}
                  <div
                    className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-lg border-2 font-black text-[10px] sm:text-xs shadow-md transition-all pointer-events-none ${
                      activeKeys.s || dpadActive.down
                        ? 'bg-sky-400 border-white text-slate-950 scale-125 shadow-sky-400/80 ring-2 ring-white'
                        : 'bg-slate-900/95 border-sky-400/80 text-sky-200'
                    }`}
                  >
                    S ▼
                  </div>

                  {/* A Key (Left) */}
                  <div
                    className={`absolute left-0.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border-2 font-black text-[10px] sm:text-xs shadow-md transition-all pointer-events-none ${
                      activeKeys.a || dpadActive.left
                        ? 'bg-sky-400 border-white text-slate-950 scale-125 shadow-sky-400/80 ring-2 ring-white'
                        : 'bg-slate-900/95 border-sky-400/80 text-sky-200'
                    }`}
                  >
                    ◄ A
                  </div>

                  {/* D Key (Right) */}
                  <div
                    className={`absolute right-0.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg border-2 font-black text-[10px] sm:text-xs shadow-md transition-all pointer-events-none ${
                      activeKeys.d || dpadActive.right
                        ? 'bg-sky-400 border-white text-slate-950 scale-125 shadow-sky-400/80 ring-2 ring-white'
                        : 'bg-slate-900/95 border-sky-400/80 text-sky-200'
                    }`}
                  >
                    D ►
                  </div>
                </>
              )}

              {/* Base Thumbstick ring */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-sky-400/60 bg-sky-500/20 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-sky-200 font-black tracking-wider">MUOVI</span>
                {controls.showVisibleKeys && (
                  <span className="text-[8px] text-sky-300 font-bold">WASD</span>
                )}
              </div>

              {/* Active Thumb Knob */}
              {leftStick.active && (
                <div
                  className="absolute w-14 h-14 rounded-full bg-gradient-to-tr from-sky-500 to-sky-300 border-2 border-white shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                  style={{ left: `${leftStick.currX}px`, top: `${leftStick.currY}px` }}
                />
              )}
            </div>
          ) : (
            /* --- VISIBLE D-PAD TOUCHABLE BUTTONS MODE --- */
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 p-1 rounded-3xl bg-slate-900/70 border-2 border-sky-400/60 backdrop-blur-xs flex flex-col items-center justify-center shrink-0 shadow-lg">
              {/* Up button */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  setDpadDirection('up', true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setDpadDirection('up', false);
                }}
                onMouseDown={() => setDpadDirection('up', true)}
                onMouseUp={() => setDpadDirection('up', false)}
                className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl border-2 flex flex-col items-center justify-center font-black text-xs transition active:scale-95 ${
                  dpadActive.up || activeKeys.w
                    ? 'bg-sky-400 border-white text-slate-950 scale-105 shadow-lg shadow-sky-400/60'
                    : 'bg-slate-800 border-sky-400/50 text-sky-200 hover:bg-slate-700'
                }`}
              >
                <span className="text-[9px]">▲</span>
                <span className="text-[10px] font-black leading-none">W</span>
              </button>

              <div className="flex items-center gap-2 my-1">
                {/* Left button */}
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setDpadDirection('left', true);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setDpadDirection('left', false);
                  }}
                  onMouseDown={() => setDpadDirection('left', true)}
                  onMouseUp={() => setDpadDirection('left', false)}
                  className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl border-2 flex flex-col items-center justify-center font-black text-xs transition active:scale-95 ${
                    dpadActive.left || activeKeys.a
                      ? 'bg-sky-400 border-white text-slate-950 scale-105 shadow-lg shadow-sky-400/60'
                      : 'bg-slate-800 border-sky-400/50 text-sky-200 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-[9px]">◄</span>
                  <span className="text-[10px] font-black leading-none">A</span>
                </button>

                {/* Center dot / quick switch */}
                <div className="w-8 h-8 rounded-full bg-slate-950/80 border border-sky-500/40 flex items-center justify-center text-[8px] text-sky-300 font-black">
                  +
                </div>

                {/* Right button */}
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setDpadDirection('right', true);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setDpadDirection('right', false);
                  }}
                  onMouseDown={() => setDpadDirection('right', true)}
                  onMouseUp={() => setDpadDirection('right', false)}
                  className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl border-2 flex flex-col items-center justify-center font-black text-xs transition active:scale-95 ${
                    dpadActive.right || activeKeys.d
                      ? 'bg-sky-400 border-white text-slate-950 scale-105 shadow-lg shadow-sky-400/60'
                      : 'bg-slate-800 border-sky-400/50 text-sky-200 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-[9px]">►</span>
                  <span className="text-[10px] font-black leading-none">D</span>
                </button>
              </div>

              {/* Down button */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  setDpadDirection('down', true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setDpadDirection('down', false);
                }}
                onMouseDown={() => setDpadDirection('down', true)}
                onMouseUp={() => setDpadDirection('down', false)}
                className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl border-2 flex flex-col items-center justify-center font-black text-xs transition active:scale-95 ${
                  dpadActive.down || activeKeys.s
                    ? 'bg-sky-400 border-white text-slate-950 scale-105 shadow-lg shadow-sky-400/60'
                    : 'bg-slate-800 border-sky-400/50 text-sky-200 hover:bg-slate-700'
                }`}
              >
                <span className="text-[10px] font-black leading-none">S</span>
                <span className="text-[9px]">▼</span>
              </button>
            </div>
          )}
        </div>

        {/* CENTER: Active Gadget Button & Visual Keyboard Guide */}
        <div className="flex flex-col items-center gap-1.5 pointer-events-auto pb-1">
          {/* Active Gadget Button (Touch-Safe) */}
          <div className="relative">
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                engine.usePlayerGadget();
              }}
              onClick={(e) => {
                e.stopPropagation();
                engine.usePlayerGadget();
              }}
              disabled={(gadgetCharges ?? engine.player.gadgetCharges) <= 0}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center border-2 sm:border-3 shadow-xl transition active:scale-90 ${
                activeKeys.e || activeKeys.q
                  ? 'bg-emerald-400 border-white text-slate-950 scale-110 shadow-emerald-400/70'
                  : (gadgetCharges ?? engine.player.gadgetCharges) > 0
                  ? 'bg-emerald-600 border-emerald-300 text-white hover:bg-emerald-500'
                  : 'bg-slate-800 border-slate-600 text-slate-500 opacity-60'
              }`}
            >
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[8px] sm:text-[9px] font-black tracking-tighter leading-none mt-0.5">
                GADGET ({gadgetCharges ?? engine.player.gadgetCharges})
              </span>
            </button>

            {/* Visible Key Badge for Gadget */}
            {controls.showVisibleKeys && (
              <span
                className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-md font-black text-[8px] sm:text-[9px] border shadow transition-all pointer-events-none ${
                  activeKeys.e || activeKeys.q
                    ? 'bg-emerald-400 border-white text-slate-950 scale-110'
                    : 'bg-slate-900 border-emerald-400 text-emerald-300'
                }`}
              >
                [E / Q]
              </span>
            )}
          </div>

          {/* Active controls & key mapping live helper pill - visible across all devices */}
          {controls.showVisibleKeys && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-xl bg-slate-950/90 border border-slate-700 shadow-lg backdrop-blur-md text-[9px] sm:text-[10px] pointer-events-auto max-w-[340px] sm:max-w-none">
              <span
                className={`px-1.5 py-0.5 rounded font-black transition-all ${
                  activeKeys.w || activeKeys.a || activeKeys.s || activeKeys.d || dpadActive.up || dpadActive.down || dpadActive.left || dpadActive.right
                    ? 'bg-sky-400 text-slate-950 scale-105 shadow-md shadow-sky-400/50'
                    : 'text-sky-300 bg-sky-950/60 border border-sky-600/40'
                }`}
              >
                WASD: Muovi
              </span>
              <span className="px-1.5 py-0.5 rounded font-black text-cyan-300 bg-cyan-950/60 border border-cyan-600/40">
                Mouse: Mira
              </span>
              <span
                onClick={() => engine.firePlayerNormalAttack()}
                className={`cursor-pointer px-1.5 py-0.5 rounded font-black transition-all active:scale-95 ${
                  activeKeys.leftClick || activeKeys.f
                    ? 'bg-red-500 text-white scale-105 shadow-md shadow-red-500/50'
                    : 'text-red-300 bg-red-950/60 border border-red-600/40 hover:bg-red-900/60'
                }`}
              >
                Click SX / F: Spara
              </span>
              <span
                onClick={() => isSuperReady && engine.firePlayerSuper()}
                className={`cursor-pointer px-1.5 py-0.5 rounded font-black transition-all active:scale-95 ${
                  activeKeys.space || activeKeys.r || activeKeys.rightClick
                    ? 'bg-yellow-300 text-slate-950 scale-105 shadow-md shadow-yellow-400/50'
                    : isSuperReady
                    ? 'text-yellow-300 bg-amber-950/80 border border-yellow-400 animate-pulse'
                    : 'text-slate-400 bg-slate-900/60 border border-slate-700'
                }`}
              >
                Click DX / Spazio: Super
              </span>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowMappingModal(true);
                }}
                className="text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/60 px-1.5 py-0.5 rounded font-black transition active:scale-95"
              >
                TAB: Mappa
              </button>
            </div>
          )}
        </div>

        {/* RIGHT CONTROLS: Super Button & Visible Red Attack Button with Touch Aim (Multi-Touch Enabled) */}
        <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto shrink-0">
          {/* Super Button (Touch-Safe with Sensitivity-Scaled Drag Aim) */}
          <div className="relative">
            <button
              ref={superTouchRef}
              onTouchStart={handleSuperTouchStart}
              onClick={(e) => {
                e.stopPropagation();
                if (isSuperReady) engine.firePlayerSuper();
              }}
              disabled={!isSuperReady}
              className={`relative w-14 h-14 sm:w-18 sm:h-18 rounded-full flex flex-col items-center justify-center border-3 sm:border-4 shadow-xl transition active:scale-90 touch-none ${
                activeKeys.space || activeKeys.r || activeKeys.rightClick || superStick.active
                  ? 'bg-yellow-200 border-white text-slate-950 scale-110 shadow-yellow-400/80'
                  : isSuperReady
                  ? 'bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 border-yellow-200 text-slate-950 animate-bounce shadow-yellow-500/50'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Zap className={`w-6 h-6 sm:w-8 sm:h-8 ${isSuperReady ? 'fill-current text-slate-950' : 'text-slate-500'}`} />
              <span className="text-[8px] sm:text-[10px] font-black">
                {isSuperReady ? 'SUPER!' : `${Math.floor(playerSuperCharge)}%`}
              </span>

              {/* Active Thumb Knob during Super drag aiming */}
              {superStick.active && (
                <div
                  className="absolute w-12 h-12 rounded-full bg-yellow-300 border-2 border-white shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                  style={{ left: `${superStick.currX}px`, top: `${superStick.currY}px` }}
                />
              )}
            </button>

            {/* Visible Key Badge for Super */}
            {controls.showVisibleKeys && (
              <span
                className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-md font-black text-[8px] sm:text-[9px] border shadow transition-all pointer-events-none whitespace-nowrap ${
                  activeKeys.space || activeKeys.r || activeKeys.rightClick || superStick.active
                    ? 'bg-yellow-300 border-white text-slate-950 scale-110'
                    : 'bg-slate-900 border-yellow-400 text-yellow-300'
                }`}
              >
                [CLICK DX / SPAZIO]
              </span>
            )}
          </div>

          {/* Right: Virtual Attack Joystick & Visible Combat Fire Button */}
          <div className="relative">
            <div
              ref={rightTouchRef}
              onTouchStart={handleRightTouchStart}
              onClick={(e) => {
                // If clicked with mouse, pass world-space angle accurately towards clicked position
                const rect = engine.canvas?.getBoundingClientRect();
                if (rect && (engine as any).scene) {
                  const sc = (engine as any).scene;
                  const wp = sc.cameras.main.getWorldPoint(e.clientX - rect.left, e.clientY - rect.top);
                  const angle = Math.atan2(wp.y - engine.player.y, wp.x - engine.player.x);
                  engine.firePlayerNormalAttack(angle);
                  return;
                }
                engine.firePlayerNormalAttack();
              }}
              className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-900/60 border-2 border-red-900/60 backdrop-blur-xs touch-none flex items-center justify-center shrink-0 cursor-crosshair shadow-lg"
            >
              {/* Visible Attack Key Badge on top */}
              {controls.showVisibleKeys && (
                <div
                  className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md border font-black text-[9px] sm:text-[10px] shadow transition-all pointer-events-none whitespace-nowrap ${
                    activeKeys.f || activeKeys.leftClick
                      ? 'bg-red-500 border-white text-white scale-110 shadow-red-500/70'
                      : 'bg-slate-900/90 border-red-500 text-red-300'
                  }`}
                >
                  [CLICK SX / F]
                </div>
              )}

              {/* Base Attack Thumbstick Button */}
              <div
                className={`w-18 h-18 sm:w-22 sm:h-22 rounded-full border-3 flex flex-col items-center justify-center transition shadow-lg ${
                  activeKeys.f || activeKeys.leftClick
                    ? 'bg-red-500 border-white text-white scale-110 shadow-red-500/60'
                    : 'bg-gradient-to-tr from-red-700 to-red-500 border-red-300 text-white shadow-red-900/40'
                }`}
              >
                <Crosshair className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-[9px] sm:text-[10px] font-black tracking-wide leading-none mt-0.5">
                  FUOCO
                </span>
                <span className="text-[7px] sm:text-[8px] text-red-200 opacity-80 leading-none">
                  Tocca / Mira
                </span>
              </div>

              {/* Active Thumb Knob during drag aiming */}
              {rightStick.active && (
                <div
                  className="absolute w-14 h-14 rounded-full bg-red-600 border-2 border-white shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                  style={{ left: `${rightStick.currX}px`, top: `${rightStick.currY}px` }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* In-Game Controls & Key Mapping Modal */}
      {showMappingModal && (
        <ControlsMappingModal
          currentConfig={controls}
          onSave={updateControls}
          onClose={() => setShowMappingModal(false)}
        />
      )}
    </div>
  );
};
