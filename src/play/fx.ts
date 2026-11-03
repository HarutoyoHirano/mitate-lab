// 手応え（ジュース）の部品：ハンコ、揺れ、数字の回転、効果音。
// どれも操作への反応としてだけ動く。動きを減らす設定では、回転・揺れ・破片・点滅を出さない。
export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let audio: AudioContext | null = null;
export const sound = { on: false };

/** 効果音（初期OFF）。step は一歩ごとに音程が上がる */
export function beep(kind: "tap" | "step" | "stamp" | "win" | "miss" | "shatter", step = 0): void {
  if (!sound.on) return;
  try {
    audio ??= new AudioContext();
    const seq: Record<typeof kind, [number, number, OscillatorType][]> = {
      tap: [[660, 0.05, "triangle"]],
      step: [[392 * Math.pow(2, step / 12), 0.07, "triangle"]],
      stamp: [[110, 0.12, "square"], [880, 0.08, "triangle"]],
      win: [[523, 0.08, "triangle"], [659, 0.08, "triangle"], [784, 0.08, "triangle"], [1047, 0.18, "triangle"]],
      miss: [[300, 0.1, "sine"], [240, 0.16, "sine"]],
      shatter: [[1400, 0.03, "sawtooth"], [900, 0.04, "sawtooth"], [500, 0.06, "sawtooth"]],
    };
    let t = audio.currentTime;
    for (const [f, d, type] of seq[kind]) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + d);
      t += d;
    }
  } catch {
    /* 音が出せない環境では鳴らさない */
  }
}

/** 舞台を揺らす。強さは 0〜1（差の大きさに合わせ、上限あり） */
export function shake(strength: number): void {
  if (reduceMotion()) return;
  const el = document.querySelector<HTMLElement>(".screen");
  if (!el) return;
  el.style.setProperty("--amp", `${Math.max(2, Math.min(10, 2 + strength * 8)).toFixed(1)}px`);
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

/** ハンコ：一瞬止めてから、大きく押す（逆転裁判・Balatro 型の間） */
export async function stamp(text: string, kind: "hit" | "win" | "miss" = "hit", strength = 0.6): Promise<void> {
  const host = document.querySelector<HTMLElement>(".screen");
  if (!host) return;
  await sleep(reduceMotion() ? 0 : 140);
  const d = document.createElement("div");
  d.className = `stamp-fx ${kind}`;
  d.textContent = text;
  d.setAttribute("role", "status");
  host.appendChild(d);
  beep(kind === "miss" ? "miss" : "stamp");
  if (kind !== "miss") shake(strength);
  await sleep(reduceMotion() ? 700 : 1100);
  d.classList.add("out");
  await sleep(reduceMotion() ? 0 : 250);
  d.remove();
}

/** 数字を回してから止める（data-roll の値へ）。A を先に、B を後に止めたいときは data-delay を付ける */
export function rollNumbers(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-roll]").forEach((el) => {
    const final = el.dataset.roll!;
    if (reduceMotion() || el.dataset.rolled) {
      el.textContent = final;
      return;
    }
    el.dataset.rolled = "1";
    const delay = Number(el.dataset.delay ?? 0);
    const s0 = performance.now();
    const tick = () => {
      const t = performance.now() - s0;
      if (t >= 380 + delay) {
        el.textContent = final;
        return;
      }
      el.textContent = final.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** 自信ゲージから減った量を浮かべる */
export function floatDamage(n: number): void {
  const g = document.querySelector<HTMLElement>(".conf");
  if (!g || n <= 0) return;
  const d = document.createElement("span");
  d.className = "dmg";
  d.textContent = `−${n}`;
  g.appendChild(d);
  setTimeout(() => d.remove(), reduceMotion() ? 600 : 1200);
}
