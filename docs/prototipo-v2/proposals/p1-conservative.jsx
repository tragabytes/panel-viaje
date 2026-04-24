/* ========================================================
   PROPUESTA 1 — CONSERVADORA
   "Refinamiento: misma estructura, mejor jerarquía"
   Paleta: HUD verde fósforo + ámbar de advertencia
   Tipo: JetBrains Mono + Space Grotesk para títulos
   ======================================================== */

/* eslint-disable */
const P1 = {};

/* ---------- V1 Principal ---------- */
P1.V1 = function P1V1({ speeding = false }) {
  return (
    <div className="dash p1-dash" data-speeding={speeding ? '1' : '0'}>
      <div className="p1-frame">
        {/* Barra superior */}
        <div className="p1-topbar">
          <div className="p1-crumbs">
            <span className="u-phos u-caps">ES</span>
            <span className="p1-sep">·</span>
            <span className="u-caps">CASTILLA-LA MANCHA</span>
            <span className="p1-sep">·</span>
            <span className="u-caps">TOLEDO</span>
          </div>
          <div className="p1-speed">
            <span className="p1-speed-num u-tab">{speeding ? '132' : '118'}</span>
            <span className="p1-speed-unit u-caps">km/h</span>
            <span className="p1-speed-lim u-tab u-dim">/ 120</span>
          </div>
        </div>

        {/* Grid 2 columnas */}
        <div className="p1-grid">
          <div className="p1-col-main">
            <div className="p1-road">
              <div className="p1-road-tag u-caps u-dim">VÍA</div>
              <div className="p1-road-name">
                <span className="p1-road-shield">A-4</span>
                <span className="p1-road-label">Autovía del Sur</span>
              </div>
              <div className="p1-road-dir u-dim u-caps">→ Madrid · pk 87</div>
            </div>

            <div className="p1-exit">
              <div className="p1-exit-tag u-caps u-dim">PRÓXIMA SALIDA · 2.4 KM</div>
              <div className="p1-exit-num u-tab">SALIDA 82</div>
              <div className="p1-exit-to u-dim">Madridejos · Consuegra</div>
            </div>

            <div className="p1-near">
              <div className="p1-near-tag u-caps u-dim">PUEBLOS CERCANOS</div>
              <ul className="p1-near-list">
                <li><span className="p1-near-dist u-tab u-phos">3.1</span><span>Madridejos</span></li>
                <li><span className="p1-near-dist u-tab u-phos">7.8</span><span>Consuegra</span></li>
                <li><span className="p1-near-dist u-tab u-phos">12.4</span><span>Tembleque</span></li>
              </ul>
            </div>
          </div>

          <div className="p1-col-wx">
            <div className="p1-wx-now">
              <WxIcon kind="cloudy" />
              <div className="p1-wx-temp u-tab">14°</div>
            </div>
            <div className="p1-wx-row"><span className="u-caps u-dim">LLUVIA</span><span className="u-tab u-phos">0.2 mm</span></div>
            <div className="p1-wx-row"><span className="u-caps u-dim">VIENTO</span><span className="u-tab">24 <span className="u-dim">km/h NO</span></span></div>
            <div className="p1-wx-row"><span className="u-caps u-dim">VISIB.</span><span className="u-tab">9 km</span></div>
            <div className="p1-wx-forecast">
              <MiniBar hours={['14h','15h','16h','17h']} temps={[14,15,14,12]} rain={[0,0.2,0.6,0.3]} />
            </div>
          </div>
        </div>

        {/* Barra inferior: POIs + Gasolineras */}
        <div className="p1-bottom">
          <div className="p1-pois">
            <div className="p1-strip-tag u-caps u-dim">POI</div>
            <div className="p1-pois-list">
              <div className="p1-poi-item">
                <div className="poi-ph" data-label="PHOTO" style={{width:36,height:28,borderRadius:2}}></div>
                <div className="p1-poi-name">Castillo Consuegra</div>
              </div>
              <div className="p1-poi-item">
                <div className="poi-ph" data-label="PHOTO" style={{width:36,height:28,borderRadius:2}}></div>
                <div className="p1-poi-name">Molinos La Mancha</div>
              </div>
              <div className="p1-poi-item">
                <div className="poi-ph" data-label="PHOTO" style={{width:36,height:28,borderRadius:2}}></div>
                <div className="p1-poi-name">Ermita del Cristo</div>
              </div>
            </div>
          </div>
          <div className="p1-fuel">
            <div className="p1-strip-tag u-caps u-dim">⛽</div>
            <div className="p1-fuel-list">
              <div className="p1-fuel-item"><span className="u-phos u-tab">1.4</span><span className="u-dim"> km</span><span className="p1-fuel-price u-tab">1.489</span></div>
              <div className="p1-fuel-item"><span className="u-phos u-tab">4.7</span><span className="u-dim"> km</span><span className="p1-fuel-price u-tab">1.512</span></div>
              <div className="p1-fuel-item"><span className="u-phos u-tab">8.2</span><span className="u-dim"> km</span><span className="p1-fuel-price u-tab">1.478</span></div>
            </div>
          </div>
        </div>

        {/* Indicador de página */}
        <div className="p1-dots">
          <span className="p1-dot p1-dot-on"></span>
          <span className="p1-dot"></span>
          <span className="p1-dot"></span>
        </div>
      </div>
    </div>
  );
};

/* ---------- V2 Meteo ---------- */
P1.V2 = function P1V2() {
  return (
    <div className="dash p1-dash">
      <WxCanvas kind="cloudy" />
      <div className="p1-wx2">
        <div className="p1-wx2-top">
          <div>
            <div className="u-caps u-dim">MADRIDEJOS · TOLEDO</div>
            <div className="p1-wx2-cond u-caps">NUBOSO</div>
          </div>
          <div className="p1-wx2-bigtemp u-tab">14°</div>
        </div>

        <div className="p1-wx2-grid">
          <div><div className="u-dim u-caps">VIENTO</div><div className="u-tab">24 km/h</div></div>
          <div><div className="u-dim u-caps">HUMEDAD</div><div className="u-tab">72%</div></div>
          <div><div className="u-dim u-caps">PRESIÓN</div><div className="u-tab">1014</div></div>
          <div><div className="u-dim u-caps">UV</div><div className="u-tab">3</div></div>
        </div>

        <div className="p1-wx2-hours">
          {[
            {h:'14', t:14, ic:'cloudy', r:0},
            {h:'15', t:15, ic:'cloudy', r:0.2},
            {h:'16', t:14, ic:'rain', r:0.6},
            {h:'17', t:12, ic:'rain', r:0.4},
            {h:'18', t:11, ic:'cloudy', r:0.1},
            {h:'19', t:10, ic:'cloudy', r:0},
            {h:'20', t:9,  ic:'clear', r:0},
            {h:'21', t:8,  ic:'clear', r:0},
          ].map(x => (
            <div key={x.h} className="p1-wx2-hr">
              <div className="u-tab u-dim">{x.h}</div>
              <WxIcon kind={x.ic} size={18} />
              <div className="u-tab">{x.t}°</div>
              {x.r > 0 && <div className="u-phos u-tab" style={{fontSize:9}}>{x.r}</div>}
            </div>
          ))}
        </div>
        <div className="p1-dots">
          <span className="p1-dot"></span>
          <span className="p1-dot p1-dot-on"></span>
          <span className="p1-dot"></span>
        </div>
      </div>
    </div>
  );
};

/* ---------- V3 POIs ---------- */
P1.V3 = function P1V3() {
  const pois = [
    {n:'Castillo de Consuegra', d:'12C.', dist:'3.1'},
    {n:'Molinos de La Mancha', d:'XVI', dist:'3.4'},
    {n:'Ermita del Cristo', d:'S. XVII', dist:'5.2'},
    {n:'Plaza Mayor Tembleque', d:'Patrim.', dist:'12.4'},
    {n:'Ruinas Calatrava', d:'S. XII', dist:'18.1'},
    {n:'Laguna Peña Hueca', d:'Natural', dist:'22.0'},
  ];
  return (
    <div className="dash p1-dash">
      <div className="p1-v3">
        <div className="p1-v3-head">
          <div className="u-caps u-dim">PUNTOS DE INTERÉS</div>
          <div className="u-caps"><span className="u-phos">6</span> · RADIO 25 KM</div>
        </div>
        <div className="p1-v3-grid">
          {pois.map((p,i) => (
            <div key={i} className="p1-v3-card">
              <div className="poi-ph" data-label="PHOTO" style={{width:'100%', height:60, borderRadius:2}}></div>
              <div className="p1-v3-name">{p.n}</div>
              <div className="p1-v3-meta">
                <span className="u-dim">{p.d}</span>
                <span className="u-phos u-tab">{p.dist} km</span>
              </div>
            </div>
          ))}
        </div>
        <div className="p1-dots">
          <span className="p1-dot"></span>
          <span className="p1-dot"></span>
          <span className="p1-dot p1-dot-on"></span>
        </div>
      </div>
    </div>
  );
};

/* ---------- Helpers compartidos ---------- */

function WxIcon({ kind = 'clear', size = 28 }) {
  const s = size;
  if (kind === 'clear') return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="14" cy="14" r="5" />
      <g opacity="0.7">
        <line x1="14" y1="3" x2="14" y2="6"/>
        <line x1="14" y1="22" x2="14" y2="25"/>
        <line x1="3" y1="14" x2="6" y2="14"/>
        <line x1="22" y1="14" x2="25" y2="14"/>
        <line x1="6.5" y1="6.5" x2="8.5" y2="8.5"/>
        <line x1="19.5" y1="19.5" x2="21.5" y2="21.5"/>
        <line x1="6.5" y1="21.5" x2="8.5" y2="19.5"/>
        <line x1="19.5" y1="8.5" x2="21.5" y2="6.5"/>
      </g>
    </svg>
  );
  if (kind === 'cloudy') return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M7 17h13a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1.5A4 4 0 0 0 7 17Z"/>
    </svg>
  );
  if (kind === 'rain') return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M7 15h13a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1.5A4 4 0 0 0 7 15Z"/>
      <line x1="10" y1="19" x2="9" y2="23"/>
      <line x1="14" y1="19" x2="13" y2="23"/>
      <line x1="18" y1="19" x2="17" y2="23"/>
    </svg>
  );
  if (kind === 'storm') return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M7 15h13a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1.5A4 4 0 0 0 7 15Z"/>
      <path d="M13 17 L11 22 L14 22 L12 26"/>
    </svg>
  );
  return null;
}

function MiniBar({ hours, temps, rain }) {
  const max = Math.max(...temps);
  const min = Math.min(...temps);
  return (
    <div className="p1-mini">
      {hours.map((h,i) => {
        const tH = 12 + ((temps[i]-min)/(max-min||1))*18;
        return (
          <div key={h} className="p1-mini-col">
            <div className="p1-mini-temp u-tab">{temps[i]}°</div>
            <div className="p1-mini-bar" style={{height: tH}}></div>
            {rain[i] > 0 && <div className="p1-mini-rain" style={{height: rain[i]*10}}></div>}
            <div className="p1-mini-h u-tab u-dim">{h}</div>
          </div>
        );
      })}
    </div>
  );
}

/* Canvas meteo simple — nubes desplazándose */
function WxCanvas({ kind = 'cloudy' }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width = 640, H = c.height = 360;
    let raf, t = 0;
    const blobs = Array.from({length: 5}, (_, i) => ({
      x: Math.random()*W, y: 40 + i*50 + Math.random()*30,
      r: 60 + Math.random()*80, v: 0.15 + Math.random()*0.15,
      a: 0.04 + Math.random()*0.05,
    }));
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      const g = ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0, '#0a1418'); g.addColorStop(1, '#050708');
      ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      for (const b of blobs) {
        b.x += b.v; if (b.x - b.r > W) b.x = -b.r;
        const grd = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grd.addColorStop(0, `rgba(125,255,160,${b.a})`);
        grd.addColorStop(1, 'rgba(125,255,160,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill();
      }
      t++; raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="p1-wxcanvas" />;
}

Object.assign(window, { P1, WxIcon, WxCanvas, MiniBar });
