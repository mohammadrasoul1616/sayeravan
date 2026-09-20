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
      background(ctx, g);
      g.particles.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
      g.coins.forEach((c) => drawCoin(ctx, c, g));
      if (g.orb && !g.orb.taken) { const bob = Math.sin(g.elapsed * 5 + g.orb.phase) * 8; ctx.save(); ctx.translate(g.orb.x, g.orb.y + bob); ctx.shadowColor = '#65e9ff'; ctx.shadowBlur = 22; ctx.fillStyle = '#64d9ff'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦', 0, 6); ctx.restore(); }
      g.obstacles.forEach((o) => { if (o.kind === 'pit') { ctx.fillStyle = themeRef.current === 'dark' ? '#070917' : '#234237'; rr(ctx, o.x, GROUND - 2, o.width, H - GROUND + 4, 6); ctx.fill(); ctx.strokeStyle = themeRef.current === 'dark' ? '#8b7fc1' : '#507a59'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + o.width, GROUND); ctx.stroke(); } else if (o.kind === 'log') { const y = GROUND - o.height; ctx.fillStyle = themeRef.current === 'dark' ? '#754762' : '#895834'; rr(ctx, o.x, y, o.width, o.height, o.height / 2); ctx.fill(); ctx.strokeStyle = '#d29b6b'; ctx.lineWidth = 3; ctx.stroke(); } else { const y = GROUND - o.height; ctx.fillStyle = o.kind === 'crystal' ? '#735ee8' : themeRef.current === 'dark' ? '#76659d' : '#74756d'; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 8, y + 11); ctx.lineTo(o.x + o.width * .55, y); ctx.lineTo(o.x + o.width, y + o.height * .48); ctx.lineTo(o.x + o.width - 5, GROUND); ctx.closePath(); ctx.fill(); ctx.strokeStyle = o.kind === 'crystal' ? '#b9b0ff' : '#aaa698'; ctx.lineWidth = 3; ctx.stroke(); } });
      const air = GROUND - (g.playerY + PH); ctx.fillStyle = 'rgba(10,14,32,.28)'; ctx.beginPath(); ctx.ellipse(PX + PW / 2, GROUND + 5, Math.max(16, 32 - air * .11), 6, 0, 0, Math.PI * 2); ctx.fill();
      const running = g.playerY >= GROUND - PH - 1; const swing = running ? Math.sin(g.runCycle * .58) : 0; const bob = running ? Math.abs(swing) * 1.7 : 0; ctx.save(); ctx.translate(PX, g.playerY + bob); ctx.rotate(running ? swing * .024 : -.08); const suit = themeRef.current === 'dark' ? '#9b87f5' : '#315ec9';
      ctx.strokeStyle = suit; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(17, 42); ctx.lineTo(9 + swing * 9, 55); ctx.moveTo(28, 42); ctx.lineTo(35 - swing * 9, 55); ctx.stroke(); ctx.fillStyle = suit; rr(ctx, 11, 19, 20, 25, 8); ctx.fill(); ctx.strokeStyle = suit; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(14, 26); ctx.lineTo(4, 30 - swing * 7); ctx.moveTo(29, 26); ctx.lineTo(38, 21 + swing * 7); ctx.stroke(); ctx.fillStyle = '#f5c8a7'; ctx.beginPath(); ctx.arc(21, 11, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#252440'; rr(ctx, 11, 2, 21, 8, 4); ctx.fill(); ctx.fillStyle = '#252440'; ctx.beginPath(); ctx.arc(24, 11, 1.8, 0, Math.PI * 2); ctx.fill(); if (g.shield > 0) { ctx.strokeStyle = 'rgba(101,233,255,.9)'; ctx.lineWidth = 3; ctx.shadowColor = '#65e9ff'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(21, 28, 39 + Math.sin(g.elapsed * 7) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; } ctx.restore();
    };
    const loop = (now: number) => {
      const dt = Math.min(1.9, (now - lastRef.current) / 16.67 || 1); lastRef.current = now; const g = gameRef.current; const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
      if (started && !paused && !g.gameOver) {
        g.elapsed += dt / 60; g.speed = Math.min(MAX_SPEED, SPEED + g.elapsed * .105); g.distance += g.speed * dt * .026; g.stage = stageFor(g.distance); g.runCycle += g.speed * dt * .15; g.velocityY += GRAVITY * dt; g.playerY = Math.min(GROUND - PH, g.playerY + g.velocityY * dt); if (g.playerY >= GROUND - PH) { g.velocityY = 0; g.jumps = 0; }
        g.comboClock = Math.max(0, g.comboClock - dt / 60); if (g.comboClock === 0 && g.combo > 0) g.combo = 0; if (g.shield > 0) g.shield = Math.max(0, g.shield - dt / 60);
        if (g.playerY >= GROUND - PH - 1 && Math.floor(g.elapsed * 10) % 2 === 0) g.particles.push({ x: PX + 10, y: GROUND + 3, vx: -1.3, vy: -.3, life: .48, color: themeRef.current === 'dark' ? '#c8c3e8' : '#e7efdc', size: 3 });
        g.particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .16 * dt; p.life -= .04 * dt; }); g.particles = g.particles.filter((p) => p.life > 0);
        if (g.distance >= g.nextObstacle) { const pit = Math.random() > .68; const log = g.stage === 'forest' && !pit && Math.random() > .28; const crystal = g.stage === 'cliffs' && !pit && Math.random() > .7; g.obstacles.push({ x: W + 40, width: pit ? 48 + Math.random() * 26 : 31 + Math.random() * 24, height: pit ? 0 : log ? 25 + Math.random() * 9 : 30 + Math.random() * 35, kind: pit ? 'pit' : log ? 'log' : crystal ? 'crystal' : 'rock' }); g.nextObstacle = g.distance + 28 + Math.random() * 16; }
        if (g.distance >= g.nextCoin) { const count = Math.random() > .5 ? 3 : 1; const y = 230 + Math.random() * 36; for (let i = 0; i < count; i += 1) g.coins.push({ x: W + 54 + i * 42, y: y - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 35, taken: false, phase: Math.random() * 6 }); g.nextCoin = g.distance + 23 + Math.random() * 18; }
        if (g.distance >= g.nextOrb) { g.orb = { x: W + 60, y: 225, taken: false, phase: Math.random() * 6 }; g.nextOrb = g.distance + 150 + Math.random() * 80; }
        g.obstacles.forEach((o) => { o.x -= g.speed * dt; }); g.coins.forEach((c) => { c.x -= g.speed * dt; }); if (g.orb) g.orb.x -= g.speed * dt;
        const bottom = g.playerY + PH;
        g.obstacles.forEach((o) => { const hit = o.kind === 'pit' ? PX + PW - 8 > o.x && PX + 8 < o.x + o.width && bottom >= GROUND - 2 : PX + PW - 7 > o.x && PX + 7 < o.x + o.width && bottom - 5 > GROUND - o.height && g.playerY + 8 < GROUND; if (hit) { if (g.shield > 0) { burst(o.x + o.width / 2, GROUND - 25, '#65e9ff', 20); g.shield = 0; o.x = -100; } else g.gameOver = true; } });
        g.coins.forEach((c) => { const cy = c.y + Math.sin(g.elapsed * 6 + c.phase) * 6; if (!c.taken && Math.abs(c.x - (PX + PW / 2)) < 30 && Math.abs(cy - (g.playerY + PH / 2)) < 39) { c.taken = true; g.coinCount += 1; g.combo += 1; g.comboClock = 2.2; burst(c.x, cy, '#fbbf24', 11); } });
        if (g.orb && !g.orb.taken && Math.abs(g.orb.x - (PX + PW / 2)) < 34 && Math.abs(g.orb.y - (g.playerY + PH / 2)) < 43) { g.orb.taken = true; g.shield = 8; burst(g.orb.x, g.orb.y, '#65e9ff', 20); }
        g.obstacles = g.obstacles.filter((o) => o.x + o.width > -45); g.coins = g.coins.filter((c) => c.x > -40 && !c.taken); if (g.orb && (g.orb.x < -40 || g.orb.taken)) g.orb = null;
        const newScore = scoreOf(g); if (g.gameOver) { setOver(true); if (newScore > best) { localStorage.setItem('shadow-jump-best', String(newScore)); setBest(newScore); } }
        if (Math.floor(g.elapsed * 8) % 2 === 0) { setScore(newScore); setCoins(g.coinCount); setSpeed(Number(g.speed.toFixed(1))); setStage(g.stage); setCombo(g.combo); setShield(g.shield > 0); }
      }
      scene(ctx, g); frameRef.current = requestAnimationFrame(loop);
    };
    lastRef.current = performance.now(); frameRef.current = requestAnimationFrame(loop); return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [started, paused, best]);

  const progress = Math.min(100, ((gameRef.current.distance - STAGES[stage].start) / (stage === 'street' ? 180 : stage === 'forest' ? 240 : 250)) * 100);
  return <main className="min-h-screen overflow-hidden bg-[#f6f7fb] px-3 py-4 text-slate-900 dark:bg-[#090b18] dark:text-white sm:px-6 sm:py-7" dir="rtl">
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <div className="flex min-w-0 items-center gap-3"><div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-white p-2 shadow-xl shadow-indigo-950/15 ring-1 ring-slate-200 dark:bg-white dark:ring-white/20" data-testid="brand-logo"><img src={LOGO_URL} alt="لوگوی Rasoul Works" className="h-full w-full object-contain" /></div><div className="min-w-0"><p className="text-xs font-black tracking-wide text-violet-600 dark:text-violet-300" dir="ltr">RASOUL WORKS.IR</p><h1 className="mt-0.5 text-2xl font-black sm:text-3xl">پرش سایه <span className="text-violet-500">+</span></h1><p className="hidden text-xs text-slate-500 dark:text-slate-300 sm:block">بدو، بپر، سکه بگیر و رکوردت را بشکن.</p></div></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setTheme((v) => v === 'dark' ? 'light' : 'dark')} data-testid="theme-toggle" className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/10" aria-label="تغییر حالت روز و شب">{theme === 'dark' ? <Sun size={19} className="text-amber-400" /> : <Moon size={19} className="text-indigo-600" />}</button><button type="button" onClick={() => started && !over && setPaused((v) => !v)} disabled={!started || over} data-testid="pause-button" className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40" aria-label="توقف بازی">{paused ? <Play size={18} /> : <Pause size={18} />}</button></div>
      </header>
      <div className="mb-3 grid grid-cols-4 gap-2 sm:mb-4 sm:gap-3">
        <div data-testid="score-display" className="stat-card"><Trophy size={15} className="text-amber-500" /><span>امتیاز</span><b>{score.toLocaleString('fa-IR')}</b></div><div data-testid="coins-display" className="stat-card"><Coins size={15} className="text-amber-500" /><span>سکه</span><b>{coins.toLocaleString('fa-IR')}</b></div><div data-testid="speed-display" className="stat-card"><Zap size={15} className="text-violet-500" /><span>سرعت</span><b dir="ltr">{speed}×</b></div><div data-testid="best-display" className="stat-card"><Crown size={15} className="text-rose-500" /><span>رکورد</span><b>{best.toLocaleString('fa-IR')}</b></div>
      </div>
      <div className="relative overflow-hidden rounded-[30px] border border-white/20 bg-slate-950 shadow-2xl shadow-indigo-950/25" data-testid="game-area">
        <div className="absolute right-3 top-3 z-10 rounded-2xl bg-slate-950/50 px-3 py-2 text-xs font-black text-white backdrop-blur-md" data-testid="stage-display">{STAGES[stage].icon} {STAGES[stage].name}<div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: STAGES[stage].tint }} /></div></div>
         {combo >= 2 && <div data-testid="combo-display" className="absolute left-4 top-4 z-10 rounded-2xl bg-amber-400 px-3 py-1.5 text-sm font-black text-amber-950 shadow-lg">{combo}× زنجیره!</div>}
        {shield && <div data-testid="shield-display" className="absolute left-4 top-14 z-10 flex items-center gap-1 rounded-xl bg-cyan-300/90 px-2.5 py-1.5 text-xs font-black text-cyan-950"><Shield size={14} /> سپر فعال</div>}
        <canvas ref={canvasRef} width={W} height={H} onPointerDown={jump} data-testid="game-canvas" className="block h-auto w-full touch-manipulation select-none" aria-label="محیط بازی؛ برای پریدن ضربه بزنید" />
        {!started && !over && <button type="button" onClick={jump} data-testid="start-game-button" className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/20 p-5 text-center text-white transition hover:bg-slate-950/30"><span className="flex items-center gap-2 rounded-2xl bg-white/15 px-5 py-3 text-lg font-black backdrop-blur-md"><Sparkles size={20} className="text-amber-300" />سکه‌های شروع را جمع کن!</span><span className="mt-3 text-sm font-medium text-white/90">ضربه بزن؛ در هوا یک پرش دوم هم داری</span></button>}
        {paused && !over && <button type="button" onClick={() => setPaused(false)} data-testid="resume-game-button" className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/55 text-white backdrop-blur-sm"><Play className="mb-3 text-violet-300" size={32} fill="currentColor" /><b className="text-2xl">بازی مکث شد</b><span className="mt-2 text-sm">برای ادامه ضربه بزن</span></button>}
        {over && <div data-testid="game-over-overlay" className="absolute inset-0 flex flex-col items-center justify-center bg-[#10122c]/80 p-6 text-center text-white backdrop-blur-sm"><Award size={34} className="text-amber-300" /><p className="mt-2 text-sm font-bold text-violet-200">دویدن خوبی بود!</p><h2 className="mt-1 text-3xl font-black">بازی تمام شد</h2><div className="mt-4 flex gap-3"><div className="rounded-2xl bg-white/10 px-5 py-3"><span className="block text-xs text-white/70">امتیاز</span><b data-testid="final-score" className="text-xl text-amber-300">{score.toLocaleString('fa-IR')}</b></div><div className="rounded-2xl bg-white/10 px-5 py-3"><span className="block text-xs text-white/70">سکه</span><b className="text-xl">{coins.toLocaleString('fa-IR')}</b></div></div><button type="button" onClick={restart} data-testid="restart-game-button" className="mt-6 flex min-h-12 items-center gap-2 rounded-2xl bg-violet-500 px-6 py-3 font-black shadow-lg transition hover:bg-violet-400"><RotateCcw size={19} />دوباره بازی کن</button></div>}
      </div>
      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"><article className="info-card"><span className="info-icon bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300"><Sparkles size={19} /></span><div><h2>ماموریت این مرحله</h2><p data-testid="mission-display">{STAGES[stage].mission}</p></div></article><article className="info-card"><span className="info-icon bg-cyan-100 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300"><Shield size={19} /></span><div><h2>گوی سپر را بگیر</h2><p>گوی آبی، یک برخورد را برایت بی‌اثر می‌کند.</p></div></article><article className="info-card"><span className="info-icon bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300"><Zap size={19} /></span><div><h2>چالش زنده ماندن</h2><p>سرعت فقط با گذشت زمان بیشتر می‌شود؛ هر ثانیه مهم است.</p></div></article></section>
      <footer className="mt-6 pb-2 text-center text-sm font-bold text-slate-500 dark:text-slate-400">یک تجربه از <span className="text-slate-900 dark:text-white" dir="ltr">rasoul works.ir</span></footer>
    </section>
  </main>;
}

export default App;
        
