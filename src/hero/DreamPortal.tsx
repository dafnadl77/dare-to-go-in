import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { PORTAL_VERTEX_SHADER, PORTAL_FRAGMENT_SHADER } from './dreamPortalShaders';
import type { AccentColor } from './dreamAccentColor';
import './DreamPortal.css';

export interface DreamPortalHandle {
  /** Drives the entire portal — both the WebGL vortex and the particle
      field read the same 0..1 value every frame. No React re-render. */
  setProgress: (value: number) => void;
}

interface DreamPortalProps {
  imageUrl: string;
  accent: AccentColor;
}

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
}

function makeParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.7,
      radius: 0.35 + ((i * 37) % 100) / 140,
      speed: 0.6 + ((i * 53) % 100) / 140,
      size: 1 + ((i * 17) % 100) / 60,
    });
  }
  return particles;
}

const PARTICLE_COUNT = 70;

/**
 * The "YES — TAKE ME IN" portal: turns the already-generated dream image
 * into a real forward-travel vortex entirely in the browser (WebGL shader
 * distortion + a 2D particle overlay), never generating or swapping in a
 * different image. If WebGL genuinely isn't available, the canvas simply
 * never paints and the DOM image beneath (kept at low opacity by the
 * caller) carries the transition instead — the timeline calling
 * setProgress still runs identically either way, so onComplete always
 * fires on schedule.
 */
const DreamPortal = forwardRef<DreamPortalHandle, DreamPortalProps>(function DreamPortal({ imageUrl, accent }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const accentRef = useRef(accent);
  accentRef.current = accent;

  useImperativeHandle(ref, () => ({
    setProgress: (value: number) => {
      progressRef.current = value;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    let destroyed = false;
    let raf = 0;
    let imageAspect = 1;

    function compile(type: number, source: string): WebGLShader {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, PORTAL_VERTEX_SHADER);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, PORTAL_FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // A single triangle that overshoots the clip space — cheaper than a
    // quad (two triangles) and avoids a seam down the diagonal.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uProgress = gl.getUniformLocation(program, 'uProgress');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uAccent = gl.getUniformLocation(program, 'uAccent');
    const uImageFit = gl.getUniformLocation(program, 'uImageFit');
    const uTexture = gl.getUniformLocation(program, 'uTexture');

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const image = new Image();
    image.onload = () => {
      if (destroyed) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      imageAspect = image.naturalWidth / image.naturalHeight;
    };
    image.src = imageUrl;

    const startTime = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas!.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas!.clientHeight * dpr));
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
        gl!.viewport(0, 0, width, height);
      }
    }

    function frame() {
      if (destroyed) return;
      resize();
      const canvasAspect = canvas!.clientWidth / canvas!.clientHeight || 1;
      let fitX = 1;
      let fitY = 1;
      if (canvasAspect > imageAspect) {
        fitY = imageAspect / canvasAspect;
      } else {
        fitX = canvasAspect / imageAspect;
      }
      const accentNow = accentRef.current;
      gl!.uniform1f(uProgress, progressRef.current);
      gl!.uniform1f(uTime, (performance.now() - startTime) / 1000);
      gl!.uniform3f(uAccent, accentNow.r / 255, accentNow.g / 255, accentNow.b / 255);
      gl!.uniform2f(uImageFit, fitX, fitY);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, texture);
      gl!.uniform1i(uTexture, 0);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(positionBuffer);
      gl.deleteTexture(texture);
    };
  }, [imageUrl]);

  // The particle field — a lightweight 2D overlay rather than a second
  // WebGL draw pass, pulled toward the center with accelerating speed as
  // the same progress value advances, tinted by the dream's own accent.
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let destroyed = false;
    let raf = 0;
    const particles = makeParticles(PARTICLE_COUNT);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(canvas!.clientWidth * dpr);
      const height = Math.round(canvas!.clientHeight * dpr);
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
      }
    }

    function frame() {
      if (destroyed) return;
      resize();
      const w = canvas!.width;
      const h = canvas!.height;
      const cx = w / 2;
      const cy = h / 2;
      const p = progressRef.current;
      ctx!.clearRect(0, 0, w, h);

      if (p > 0.02) {
        const accentNow = accentRef.current;
        const pull = Math.pow(p, 1.6);
        const opacity = Math.min(1, p * 2) * (1 - Math.max(0, p - 0.92) * 12);
        for (const particle of particles) {
          const radius = particle.radius * (1 - pull) * Math.max(w, h) * 0.5;
          const streak = 0.02 + pull * 0.22;
          const x = cx + Math.cos(particle.angle) * radius;
          const y = cy + Math.sin(particle.angle) * radius;
          const tailX = cx + Math.cos(particle.angle) * radius * (1 + streak);
          const tailY = cy + Math.sin(particle.angle) * radius * (1 + streak);
          const size = particle.size * (0.6 + pull * 2.2) * (w / 900);
          const grad = ctx!.createLinearGradient(tailX, tailY, x, y);
          grad.addColorStop(0, accentNow.cssAlpha(0));
          grad.addColorStop(1, accentNow.cssAlpha(Math.max(0, opacity) * 0.85));
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = size;
          ctx!.lineCap = 'round';
          ctx!.beginPath();
          ctx!.moveTo(tailX, tailY);
          ctx!.lineTo(x, y);
          ctx!.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="dream-portal">
      <canvas ref={canvasRef} className="dream-portal-gl" aria-hidden="true" />
      <canvas ref={particleCanvasRef} className="dream-portal-particles" aria-hidden="true" />
    </div>
  );
});

export default DreamPortal;
