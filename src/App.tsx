import { useCallback, useEffect, useRef, useState } from 'react';
import { Award, Coins, Crown, Moon, Pause, Play, RotateCcw, Shield, Sparkles, Sun, Trophy, Zap } from 'lucide-react';

type Theme = 'light' | 'dark';
type StageId = 'street' | 'forest' | 'cliffs';
type ObstacleKind = 'rock' | 'pit' | 'log' | 'crystal';
type Obstacle = { x: number; width: number; height: number; kind: ObstacleKind };
type Coin = { x: number; y: number; taken: boolean; phase: number; intro?: boolean };
type Orb = { x: number; y: number; taken: boolean; phase: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Game = { playerY: number; velocityY: number; jumps: number; obstacles: Obstacle[]; coins: Coin[]; orb: Orb | null; particles: Particle[]; distance: number; coinCount: number; speed: number; elapsed: number; nextObstacle: number; nextCoin: number; nextOrb: number; stage: StageId; runCycle: number; gameOver: boolean; shield: number; combo: number; comboClock: number };

const W = 900;
const H = 440;
const GROUND = 353;
const PX = 132;
const PW = 42;
const PH = 58;
const GRAVITY = 0.72;
const JUMP = -14.2;
const SPEED = 4.8;
const MAX_SPEED = 12.8;
const LOGO_URL = 'https://s3.thr3.sotoon.ir/app-builder/owner-assets/0974d174-b0bd-4e8e-8729-dc80a7c449af/bdf79b2d-9e7c-4616-bab5-aef1cc36328a.png';

const STAGES: Record<StageId, { name: string; icon: string; start: number; tint: string; mission: string }> = {
  street: { name: 'بلوار ماه', icon: '🏙️', start: 0, tint: '#a78bfa', mission: '۱۲ سکه جمع کن تا جنگل را ببینی' },
  forest: { name: 'جنگل شب‌تاب', icon: '🌲', start: 180, tint: '#34d399', mission: 'از میان تنه‌ها و ریشه‌ها عبور کن' },
  cliffs: { name: 'صخره‌های مه‌آلود', icon: '⛰️', start: 420, tint: '#fbbf24', mission: 'تا انتهای صخره‌ها دوام بیاور' },
};

const introCoins = (): Coin[] => [0, 1, 2, 3, 4, 5].map((i) => ({ x: 280 + i * 48, y: 279 - Math.sin((i / 5) * Math.PI) * 68, taken: false, phase: i * 0.48, intro: true }));
const stageFor = (distance: number): StageId => distance >= 420 ? 'cliffs' : distance >= 180 ? 'forest' : 'street';
const scoreOf = (g: Game) => Math.floor(g.distance * 2 + g.coinCount * 20 + Math.max(0, g.combo - 1) * 10);
const freshGame = (): Game => ({ playerY: GROUND - PH, velocityY: 0, jumps: 0, obstacles: [], coins: introCoins(), orb: null, particles: [], distance: 0, coinCount: 0, speed: SPEED, elapsed: 0, nextObstacle: 53, nextCoin: 75, nextOrb: 145, stage: 'street', runCycle: 0, gameOver: false, shield: 0, combo: 0, comboClock: 0 });

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(freshGame());
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const themeRef = useRef<Theme>('dark');
  const [theme, setTheme] = useState<Theme>('dark');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('shadow-jump-best') || 0));
  const [coins, setCoins] = useState(0);
  const [speed, setSpeed] = useState(SPEED);
  const [stage, setStage] = useState<StageId>('street');
  const [combo, setCombo] = useState(0);
  const [shield, setShield] = useState(false);

  useEffect(() => { themeRef.current = theme; document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);

  const burst = (x: number, y: number, color: string, count = 10) => {
    const g = gameRef.current;
    for (let i = 0; i < count; i += 1) g.particles.push({ x, y, vx: (Math.random() - .5) * 5.5, vy: -Math.random() * 4 - 1, life: 1, color, size: 2 + Math.random() * 3 });
  };

  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.gameOver || paused) return;
    if (g.jumps < 2) {
      g.velocityY = g.jumps === 0 ? JUMP : JUMP * .86;
      g.jumps += 1;
      burst(PX + 18, g.playerY + PH, themeRef.current === 'dark' ? '#d8ccff' : '#e2e8f0', 7);
      setStarted(true);
    }
  }, [paused]);

  const restart = useCallback(() => {
    gameRef.current = freshGame();
    setStarted(false); setPaused(false); setOver(false); setScore(0); setCoins(0); setSpeed(SPEED); setStage('street'); setCombo(0); setShield(false);
    lastRef.current = performance.now();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } if (e.code === 'KeyP' && started && !over) setPaused((v) => !v); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [jump, started, over]);

  useEffect(() => {
    const drawCoin = (ctx: CanvasRenderingContext2D, c: Coin, g: Game) => {
      if (c.taken) return;
      const bob = Math.sin(g.elapsed * 6 + c.phase) * 6;
      const spin = .6 + Math.abs(Math.sin(g.elapsed * 6 + c.phase)) * .4;
      ctx.save(); ctx.translate(c.x, c.y + bob); ctx.scale(spin, 1);
      ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = c.intro ? 25 : 18; ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(0, 0, c.intro ? 16 : 14, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#b45309'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff5bd'; ctx.beginPath(); ctx.arc(-3, -4, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#b45309'; ctx.font = 'bold 13px Vazirmatn'; ctx.textAlign = 'center'; ctx.fillText('✦', 0, 5); ctx.restore();
    };
    const tree = (ctx: CanvasRenderingContext2D, x: number, scale: number, dark: boolean) => {
      const y = GROUND + 9; ctx.fillStyle = dark ? '#493451' : '#754b2b'; ctx.fillRect(x - 6 * scale, y - 104 * scale, 12 * scale, 110 * scale); ctx.fillStyle = dark ? '#183f48' : '#34885b';
      [-23, 0, 23].forEach((dx, i) => { ctx.beginPath(); ctx.arc(x + dx * scale, y - (86 + (i === 1 ? 22 : 0)) * scale, 30 * scale, 0, Math.PI * 2); ctx.fill(); });
    };
    const background = (ctx: CanvasRenderingContext2D, g: Game) => {
      const dark = themeRef.current === 'dark'; const scroll = g.distance * 9;
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, dark ? '#101331' : '#7fd3f3'); sky.addColorStop(1, dark ? '#3e3765' : '#eefbff'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      if (dark) { ctx.fillStyle = '#fff2bd'; ctx.beginPath(); ctx.arc(710, 72, 33, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#101331'; ctx.beginPath(); ctx.arc(724, 61, 31, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 24; i += 1) { ctx.globalAlpha = .35 + (i % 3) * .2; ctx.fillRect((i * 131 + 51) % W, 28 + (i * 47) % 178, 2, 2); } ctx.globalAlpha = 1; }
      else { ctx.fillStyle = '#ffd159'; ctx.beginPath(); ctx.arc(710, 70, 36, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 3; i += 1) { const x = ((i * 350 - scroll * .05) % 1100 + 1100) % 1100 - 100; ctx.beginPath(); ctx.arc(x, 100, 22, 0, Math.PI * 2); ctx.arc(x + 26, 88, 27, 0, Math.PI * 2); ctx.arc(x + 57, 102, 19, 0, Math.PI * 2); ctx.fill(); } }
      if (g.stage === 'street') {
        ctx.fillStyle = dark ? '#252a57' : '#90c78a'; for (let i = 0; i < 10; i += 1) { const x = ((i * 120 - scroll * .19) % 1200 + 1200) % 1200 - 110; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 60, 188 + (i % 2) * 22); ctx.lineTo(x + 132, GROUND); ctx.fill(); }
        ctx.fillStyle = dark ? '#262d46' : '#4b5663'; ctx.fillRect(0, GROUND - 4, W, H - GROUND + 4); ctx.fillStyle = dark ? '#69749b' : '#f5df74'; for (let x = -90; x < W + 90; x += 115) ctx.fillRect(x - (scroll % 115), GROUND + 41, 62, 6);
      } else if (g.stage === 'forest') {
        ctx.fillStyle = dark ? '#123b44' : '#65aa64'; ctx.fillRect(0, GROUND - 10, W, H - GROUND + 10); for (let i = 0; i < 11; i += 1) { const x = ((i * 104 - scroll * .42) % 1150 + 1150) % 1150 - 90; tree(ctx, x, .58 + (i % 3) * .13, dark); } ctx.fillStyle = dark ? '#234b39' : '#4a7c3e'; ctx.fillRect(0, GROUND, W, H - GROUND); ctx.fillStyle = dark ? '#4d7754' : '#8eb858'; for (let x = -20; x < W + 30; x += 45) ctx.fillRect(x - (scroll % 45), GROUND + 13, 24, 3);
      } else {
        ctx.fillStyle = dark ? '#353451' : '#9db3ad'; for (let i = 0; i < 8; i += 1) { const x = ((i * 135 - scroll * .13) % 1160 + 1160) % 1160 - 90; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 68, 168 + (i % 2) * 25); ctx.lineTo(x + 145, GROUND); ctx.fill(); } ctx.fillStyle = dark ? '#283345' : '#738178'; ctx.fillRect(0, GROUND - 2, W, H - GROUND + 2); for (let x = -50; x < W + 70; x += 74) { rr(ctx, x - (scroll % 74), GROUND + 12, 58, 27, 9); ctx.fillStyle = dark ? '#57647a' : '#abb6ad'; ctx.fill(); }
      }
    };
    const scene = (ctx: CanvasRenderingContext2D, g: Game) => {

