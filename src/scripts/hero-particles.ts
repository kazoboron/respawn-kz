/**
 * Canvas-based particle network for the hero section.
 *
 * Draws a sparse mesh of glowing nodes connected by faint lines. Particles
 * ("packets of data") travel along the lines, leaving a brief trail. The
 * effect reads as "data flowing through cyberspace" — fitting for a gaming
 * club platform.
 *
 * Performance: vanilla JS, no library. Single requestAnimationFrame loop.
 * Pauses when off-screen (IntersectionObserver). Respects prefers-reduced-
 * motion (in that case it renders one static frame and exits the loop).
 *
 * Usage: include <canvas id="hero-particles"> in the hero markup, then call
 * `setupHeroParticles()` once at boot.
 */

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Packet {
  from: number;
  to: number;
  t: number; // 0..1 progress along edge
  speed: number;
  color: string;
}

const NODE_COUNT_DESKTOP = 36;
const NODE_COUNT_MOBILE = 18;
const CONNECT_DISTANCE = 180; // px; nodes closer than this get a line
const PACKET_SPAWN_RATE = 0.02; // packets per frame
const PACKET_COLORS = [
  'rgba(0, 229, 255, 1)',    // electric cyan
  'rgba(255, 0, 128, 1)',    // hot magenta
  'rgba(168, 85, 247, 1)',   // violet (brand)
];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function setupHeroParticles(): void {
  const canvas = document.getElementById('hero-particles') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let nodes: Node[] = [];
  let packets: Packet[] = [];
  let width = 0;
  let height = 0;
  let nodeCount = NODE_COUNT_DESKTOP;
  let rafId: number | null = null;
  let visible = true;
  let lastTime = performance.now();

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas!.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas!.width = Math.round(width * dpr);
    canvas!.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    nodeCount = width < 768 ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP;
    rebuildNodes();
  }

  function rebuildNodes(): void {
    nodes = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
      });
    }
  }

  function spawnPacket(): void {
    if (nodes.length < 2) return;
    const from = Math.floor(Math.random() * nodes.length);
    // find a neighbor in connect distance
    const candidates: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (i === from) continue;
      const dx = nodes[i].x - nodes[from].x;
      const dy = nodes[i].y - nodes[from].y;
      if (dx * dx + dy * dy < CONNECT_DISTANCE * CONNECT_DISTANCE) candidates.push(i);
    }
    if (candidates.length === 0) return;
    const to = candidates[Math.floor(Math.random() * candidates.length)];
    packets.push({
      from,
      to,
      t: 0,
      speed: rand(0.006, 0.014),
      color: PACKET_COLORS[Math.floor(Math.random() * PACKET_COLORS.length)],
    });
  }

  function tick(now: number): void {
    const dt = Math.min(50, now - lastTime); // cap dt so background tabs don't spike
    lastTime = now;
    const frameScale = dt / 16.67; // normalize to ~60fps baseline

    // Drift nodes
    for (const n of nodes) {
      n.x += n.vx * frameScale;
      n.y += n.vy * frameScale;
      if (n.x < 0 || n.x > width) n.vx *= -1;
      if (n.y < 0 || n.y > height) n.vy *= -1;
    }

    // Maybe spawn a new packet
    if (Math.random() < PACKET_SPAWN_RATE * frameScale) {
      spawnPacket();
    }

    // Advance packets
    for (const p of packets) p.t += p.speed * frameScale;
    packets = packets.filter((p) => p.t < 1);

    draw();

    if (visible && !prefersReducedMotion) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function draw(): void {
    ctx!.clearRect(0, 0, width, height);

    // Draw connecting lines (subtle)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < CONNECT_DISTANCE * CONNECT_DISTANCE) {
          const alpha = (1 - Math.sqrt(distSq) / CONNECT_DISTANCE) * 0.18;
          ctx!.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(nodes[i].x, nodes[i].y);
          ctx!.lineTo(nodes[j].x, nodes[j].y);
          ctx!.stroke();
        }
      }
    }

    // Draw nodes
    for (const n of nodes) {
      ctx!.fillStyle = 'rgba(196, 181, 253, 0.5)';
      ctx!.beginPath();
      ctx!.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
      ctx!.fill();
    }

    // Draw packets with glow trail
    for (const p of packets) {
      const a = nodes[p.from];
      const b = nodes[p.to];
      if (!a || !b) continue;
      const x = a.x + (b.x - a.x) * p.t;
      const y = a.y + (b.y - a.y) * p.t;

      // Glow halo (large soft circle)
      const gradient = ctx!.createRadialGradient(x, y, 0, x, y, 16);
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(1, p.color.replace(', 1)', ', 0)'));
      ctx!.fillStyle = gradient;
      ctx!.beginPath();
      ctx!.arc(x, y, 16, 0, Math.PI * 2);
      ctx!.fill();

      // Solid center
      ctx!.fillStyle = p.color;
      ctx!.beginPath();
      ctx!.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  function start(): void {
    if (rafId !== null) return;
    if (prefersReducedMotion) {
      // Render one static frame
      draw();
      return;
    }
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // Pause when canvas leaves viewport (e.g., user scrolled down)
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      }
    },
    { threshold: 0.05 },
  );

  resize();
  rebuildNodes();
  spawnPacket();
  observer.observe(canvas);

  let resizeTimeout: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(resize, 150);
  });

  start();
}
