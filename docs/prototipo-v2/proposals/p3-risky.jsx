/* ========================================================
   PROPUESTA 3 — ARRIESGADA
   "El panel respira con el coche. La tipografía es el dato."
   - Fusión progresiva de vistas (sin swipe fijo; se reordena)
   - Layout distinto autovía vs secundaria
   - Tipografía variable/dominante
   - Topónimos gigantes, casi cartografía
   ======================================================== */

/* eslint-disable */
const P3 = {};

/* ---------- V1 MODO AUTOVÍA ---------- */
P3.V1_highway = function P3V1Hw({ speeding = false }) {
  return (
    <div className="dash p3-dash p3-highway" data-speeding={speeding ? '1' : '0'}>
      {/* Topónimo gigante fondo */}
      <div className="p3-meganame">MADRIDEJOS</div>

      {/* Velocidad cruda — número puro, sin chrome */}
      <div className="p3-speed-raw">
        <div className="p3-speed-big u-tab">{speeding ? '132' : '118'}</div>
        <div className="p3-speed-ctx">
          <div className="p3-speed-limit u-tab">120</div>
          <div className="p3-speed-label u-caps">LÍMITE</div>
        </div>
      </div>

      {/* Barra superior: breadcrumb fino */}
      <div className="p3-crumbs u-caps">
        <span className="u-mute">ES </span>
        <span className="u-mute">› C-LA MANCHA </span>
        <span className="u-dim">› TOLEDO</span>
      </div>

      {/* Carretera como línea viva abajo */}
      <div className="p3-roadline">
        <div className="p3-roadline-track">
          <div className="p3-roadline-fill"></div>
          <div className="p3-roadline-marker p3-rl-m1"><span className="u-caps">PK 87</span></div>
          <div className="p3-roadline-marker p3-rl-m2"><span className="u-caps">SAL 82</span></div>
          <div className="p3-roadline-marker p3-rl-m3"><span className="u-caps">SAL 79</span></div>
        </div>
        <div className="p3-roadline-label">
          <span className="p3-road-sigil">A-4</span>
          <span className="u-dim">→ Madrid</span>
        </div>
      </div>

      {/* Próxima salida — como subtítulo grande */}
      <div className="p3-nextexit">
        <div className="u-dim u-caps">en 2.4 km</div>
        <div className="p3-nextexit-num">SAL 82 <span className="u-dim">· Consuegra</span></div>
      </div>

      {/* Meteo — inline glyph */}
      <div className="p3-wx-inline">
        <WxIcon kind="cloudy" size={14} />
        <span className="u-tab">14°</span>
        <span className="u-dim u-tab">· 0.2mm</span>
      </div>

      {/* Tira inferior — POIs y gasolineras como microcopy */}
      <div className="p3-micro">
        <span className="u-mute u-caps">POI</span>
        <span className="u-dim">Castillo</span>
        <span className="u-tab u-phos">3.1</span>
        <span className="p3-microdot"></span>
        <span className="u-dim">Molinos</span>
        <span className="u-tab u-phos">3.4</span>
        <span className="p3-microsep"></span>
        <span className="u-mute u-caps">⛽</span>
        <span className="u-tab u-phos">1.478</span>
        <span className="u-dim u-tab">· 1.4km</span>
      </div>
    </div>
  );
};

/* ---------- V1 MODO CARRETERA SECUNDARIA ---------- */
P3.V1_rural = function P3V1Ru({ speeding = false }) {
  return (
    <div className="dash p3-dash p3-rural" data-speeding={speeding ? '1' : '0'}>
      {/* El nombre del pueblo toma protagonismo — no hay salidas */}
      <div className="p3-rural-main">
        <div className="u-caps u-dim p3-rural-meta">ENTRANDO EN</div>
        <div className="p3-rural-name">Orgaz</div>
        <div className="p3-rural-sub u-dim">Toledo · Montes de Toledo</div>
      </div>

      {/* Velocidad más pequeña — menor urgencia en rural */}
      <div className="p3-speed-rural">
        <span className="p3-speed-rural-num u-tab">{speeding ? '102' : '78'}</span>
        <span className="u-dim u-tab"> / 90</span>
      </div>

      {/* Carretera info */}
      <div className="p3-rural-road">
        <span className="p3-road-sigil p3-sigil-sm">CM-42</span>
        <span className="u-dim">Madridejos ← → Toledo</span>
      </div>

      {/* Grid de POIs aquí — lo que en autovía era micro, aquí respira */}
      <div className="p3-rural-pois">
        <div className="p3-rural-poi">
          <div className="poi-ph" data-label="PHOTO" style={{width:'100%',height:40,borderRadius:2}}></div>
          <div className="p3-rural-poi-name">Castillo de Orgaz</div>
          <div className="u-dim u-tab">0.4 km · S.XIV</div>
        </div>
        <div className="p3-rural-poi">
          <div className="poi-ph" data-label="PHOTO" style={{width:'100%',height:40,borderRadius:2}}></div>
          <div className="p3-rural-poi-name">Iglesia Santo Tomé</div>
          <div className="u-dim u-tab">0.5 km · S.XVII</div>
        </div>
        <div className="p3-rural-poi">
          <div className="poi-ph" data-label="PHOTO" style={{width:'100%',height:40,borderRadius:2}}></div>
          <div className="p3-rural-poi-name">Plaza Mayor</div>
          <div className="u-dim u-tab">0.6 km</div>
        </div>
      </div>

      {/* Meteo + gasolinera inline, menor prioridad */}
      <div className="p3-rural-foot">
        <span><WxIcon kind="cloudy" size={14} /> <span className="u-tab">14°</span></span>
        <span className="u-dim">·</span>
        <span><span className="u-mute u-caps">⛽</span> <span className="u-tab u-phos">1.478</span> <span className="u-dim u-tab">1.4km</span></span>
      </div>
    </div>
  );
};

/* ---------- V2 — Tipografía que reacciona al tiempo ---------- */
P3.V2 = function P3V2() {
  return (
    <div className="dash p3-dash p3-v2">
      <WxCanvasP3 />
      <div className="p3-v2-inner">
        <div className="p3-v2-word">
          <span>N</span><span>U</span><span>B</span><span>O</span><span>S</span><span>O</span>
        </div>
        <div className="p3-v2-temp u-tab">14°</div>
        <div className="p3-v2-story u-caps">
          Va a llover a las <span className="u-phos u-tab">16:00</span>
          <span className="u-dim"> · ráfagas </span>
          <span className="u-tab">30 km/h</span>
        </div>

        {/* Timeline vertical de horas — tipografía variable */}
        <div className="p3-v2-timeline">
          {[
            {h:'14', t:14, intensity:0.2},
            {h:'15', t:15, intensity:0.3},
            {h:'16', t:14, intensity:0.9},
            {h:'17', t:12, intensity:0.7},
            {h:'18', t:11, intensity:0.3},
            {h:'19', t:10, intensity:0.1},
          ].map(x => (
            <div key={x.h} className="p3-v2-hr" style={{
              fontWeight: 300 + Math.round(x.intensity * 500),
              color: `rgba(${125 + x.intensity*50}, ${255}, ${160}, ${0.4 + x.intensity * 0.6})`
            }}>
              <span className="u-tab" style={{opacity: 0.6, fontWeight: 400}}>{x.h}</span>
              <span className="u-tab">{x.t}°</span>
              <div className="p3-v2-bar" style={{width: `${x.intensity * 100}%`}}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ---------- V3 — POIs como cartografía ---------- */
P3.V3 = function P3V3() {
  return (
    <div className="dash p3-dash p3-v3">
      {/* Fondo: retícula topográfica */}
      <svg className="p3-v3-bg" viewBox="0 0 640 360" preserveAspectRatio="none">
        <defs>
          <pattern id="topo" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(125,255,160,0.04)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="640" height="360" fill="url(#topo)" />
        {/* Curvas de nivel abstractas */}
        <path d="M 0 120 Q 160 80 320 140 T 640 110" fill="none" stroke="rgba(125,255,160,0.06)" strokeWidth="1"/>
        <path d="M 0 200 Q 200 180 380 220 T 640 200" fill="none" stroke="rgba(125,255,160,0.06)" strokeWidth="1"/>
      </svg>

      {/* Coordenadas */}
      <div className="p3-v3-coord u-caps u-mute">39°28′N  03°32′W</div>

      {/* Nombre del entorno gigante */}
      <div className="p3-v3-title">
        <div className="u-caps u-dim">ENTORNO · RADIO 25KM</div>
        <div className="p3-v3-placename">LA MANCHA</div>
      </div>

      {/* POIs posicionados como puntos en mapa + fotos pequeñas */}
      <div className="p3-v3-map">
        <div className="p3-v3-pin" style={{ left: '18%', top: '30%' }}>
          <div className="poi-ph p3-v3-thumb" data-label="IMG"></div>
          <div className="p3-v3-pin-label">
            <div className="p3-v3-pin-name">Castillo Consuegra</div>
            <div className="u-phos u-tab p3-v3-pin-dist">3.1</div>
          </div>
          <div className="p3-v3-pin-ring"></div>
        </div>
        <div className="p3-v3-pin" style={{ left: '42%', top: '55%' }}>
          <div className="poi-ph p3-v3-thumb" data-label="IMG"></div>
          <div className="p3-v3-pin-label">
            <div className="p3-v3-pin-name">Molinos</div>
            <div className="u-phos u-tab p3-v3-pin-dist">3.4</div>
          </div>
          <div className="p3-v3-pin-ring"></div>
        </div>
        <div className="p3-v3-pin" style={{ left: '68%', top: '35%' }}>
          <div className="poi-ph p3-v3-thumb" data-label="IMG"></div>
          <div className="p3-v3-pin-label">
            <div className="p3-v3-pin-name">Ermita Cristo</div>
            <div className="u-phos u-tab p3-v3-pin-dist">5.2</div>
          </div>
          <div className="p3-v3-pin-ring"></div>
        </div>
        <div className="p3-v3-pin p3-v3-pin-far" style={{ left: '88%', top: '62%' }}>
          <div className="p3-v3-pin-label">
            <div className="p3-v3-pin-name u-dim">Tembleque</div>
            <div className="u-dim u-tab p3-v3-pin-dist">12.4</div>
          </div>
          <div className="p3-v3-pin-ring"></div>
        </div>

        {/* Tú aquí */}
        <div className="p3-v3-you" style={{ left: '30%', top: '72%' }}>
          <div className="p3-v3-you-ring"></div>
          <div className="p3-v3-you-core"></div>
          <div className="p3-v3-you-label u-caps u-phos">AQUÍ</div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Canvas meteo P3 (partículas + gradiente animado) ---------- */
function WxCanvasP3() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width = 640, H = c.height = 360;
    const clouds = Array.from({length: 6}, (_, i) => ({
      x: (i * 130) + Math.random()*80,
      y: 30 + Math.random()*80,
      r: 70 + Math.random()*60,
      v: 0.1 + Math.random()*0.12,
      a: 0.03 + Math.random()*0.04,
    }));
    const drops = Array.from({length: 60}, () => ({
      x: Math.random()*W,
      y: Math.random()*H,
      l: 6 + Math.random()*10,
      v: 2 + Math.random()*2,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0, '#081317');
      g.addColorStop(1, '#04070a');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      for (const b of clouds) {
        b.x += b.v; if (b.x - b.r > W) b.x = -b.r;
        const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grd.addColorStop(0, `rgba(125,255,160,${b.a})`);
        grd.addColorStop(1, 'rgba(125,255,160,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(125,255,160,0.28)';
      ctx.lineWidth = 0.8;
      for (const d of drops) {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 1.5, d.y + d.l);
        ctx.stroke();
        d.y += d.v; d.x -= 0.4;
        if (d.y > H) { d.y = -10; d.x = Math.random()*W; }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="p3-v2-canvas" />;
}

Object.assign(window, { P3, WxCanvasP3 });
