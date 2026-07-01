// nye-armature.js
// Drop-in factory for the #deep scene.
//
// Contract:
//   import("./nye-armature.js").then(({ mountNyeArmature }) => {
//     const nye = mountNyeArmature(THREE, scene, {
//       instant: new Date(2002, 0, 2, 15, 45, 0, 0),
//       warm: true
//     });
//     // in the existing frame loop:
//     // nye.tick(t * 0.001);
//   });

export function mountNyeArmature(THREE, scene, opts) {
  if (!THREE || !scene) {
    throw new Error("mountNyeArmature(THREE, scene, opts) requires THREE and a scene.");
  }
  if (typeof document === "undefined") {
    throw new Error("mountNyeArmature requires a browser DOM for CanvasTexture glyphs.");
  }

  const T = THREE;
  const options = opts || {};
  const TAU = Math.PI * 2;
  const AU_SCALE = 18;
  const SUN_BASE_R = 1.85;
  const DEFAULT_INSTANT = new Date(2002, 0, 2, 15, 45, 0, 0);
  const instant =
    options.instant && typeof options.instant.getTime === "function" && isFinite(options.instant.getTime())
      ? new Date(options.instant.getTime())
      : new Date(DEFAULT_INSTANT.getTime());
  const warm = options.warm !== false;

  const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const STEM_COLORS = [
    "#c9a06f", "#d6b078", "#e0876a", "#e79a74", "#c8a961",
    "#d8b870", "#f0e4cb", "#f4ead2", "#b8926a", "#c49b72"
  ];
  const BRANCH_COLORS = [
    "#d2a66c", "#c8a961", "#c99a6f", "#d3ad76", "#c8a961", "#d78468",
    "#e0876a", "#d8b870", "#f0e4cb", "#f4ead2", "#c8a961", "#c49b72"
  ];
  const PILLARS = {
    month: { slot: "month", label: "月", pair: "庚子", stem: "庚", branch: "子", stemIndex: 6, branchIndex: 0 },
    day: { slot: "day", label: "日", pair: "庚午", stem: "庚", branch: "午", stemIndex: 6, branchIndex: 6 },
    hour: { slot: "hour", label: "时", pair: "甲申", stem: "甲", branch: "申", stemIndex: 0, branchIndex: 8 }
  };
  PILLARS.month.index60 = sexagenaryIndex(PILLARS.month.stemIndex, PILLARS.month.branchIndex);
  PILLARS.day.index60 = sexagenaryIndex(PILLARS.day.stemIndex, PILLARS.day.branchIndex);
  PILLARS.hour.index60 = sexagenaryIndex(PILLARS.hour.stemIndex, PILLARS.hour.branchIndex);

  const group = new T.Group();
  group.name = "NyeArmature";
  group.userData.nyeArmature = true;
  group.userData.birthInstantMs = instant.getTime();
  group.userData.pillars = {
    month: "庚子",
    day: "庚午",
    hour: "甲申",
    noYearRing: true
  };
  if (typeof options.scale === "number" && isFinite(options.scale) && options.scale > 0) {
    group.scale.setScalar(options.scale);
  }
  scene.add(group);

  const solarSystem = new T.Group();
  solarSystem.name = "NyeSolarSystem";
  group.add(solarSystem);

  const animatedUniforms = [];
  const coronaLayers = [];
  const gearMotions = [];
  let moonUniformsRef = null;

  const ephem = computeFrozenEphemeris(instant);
  const earthRadiusVis = 1.8;
  const earthToMoon = ephem.moon.clone().sub(ephem.earth);
  const emLen = earthToMoon.length();
  if (emLen < 1e-9) earthToMoon.set(1, 0, 0);
  else earthToMoon.multiplyScalar(1 / emLen);
  const visibleMoonDistance = Math.max(emLen, earthRadiusVis * 3.15);
  const moonVisiblePosition = ephem.earth.clone().add(earthToMoon.clone().multiplyScalar(visibleMoonDistance));

  const sun = buildSun();
  solarSystem.add(sun.group);

  const eclipticGroup = new T.Group();
  eclipticGroup.name = "MonthEclipticGearPlane";
  eclipticGroup.userData.nyePart = "month-gear-plane";
  eclipticGroup.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), ephem.eclipticNormal);
  solarSystem.add(eclipticGroup);

  const monthGear = createPillarGear({
    name: "MonthPillarGear",
    pillar: PILLARS.month,
    stemRadius: AU_SCALE - 1.55,
    branchRadius: AU_SCALE + 1.45,
    toothScale: 1.0,
    glyphStemScale: 0.92,
    glyphBranchScale: 1.0,
    couplingOpacity: 0.18
  });
  eclipticGroup.add(monthGear.group);

  const earth = buildEarth(earthRadiusVis);
  earth.group.position.copy(ephem.earth);
  solarSystem.add(earth.group);

  const moon = buildMoon(earthRadiusVis * 0.272);
  moon.mesh.position.copy(moonVisiblePosition);
  solarSystem.add(moon.mesh);

  setLightDirections();
  earth.mesh.rotation.y = siderealOrFallbackRotationY(instant);

  solarSystem.updateMatrixWorld(true);
  const earthInEcliptic = ephem.earth.clone();
  eclipticGroup.worldToLocal(earthInEcliptic);
  const earthOrbitAngle = Math.atan2(earthInEcliptic.y, earthInEcliptic.x);
  monthGear.stemSwivel.rotation.z = earthOrbitAngle - PILLARS.month.stemIndex * (TAU / 10);
  monthGear.branchSwivel.rotation.z = earthOrbitAngle - PILLARS.month.branchIndex * (TAU / 12);
  placeLabel(monthGear.label, AU_SCALE + 4.7, earthOrbitAngle, 0.2);
  gearMotions.push({ target: monthGear.stemSwivel, base: monthGear.stemSwivel.rotation.z, speed: 0.0009 });
  gearMotions.push({ target: monthGear.branchSwivel, base: monthGear.branchSwivel.rotation.z, speed: -0.00072 });

  const dayClockOrbitPlaneGroup = new T.Group();
  dayClockOrbitPlaneGroup.name = "DayClockOrbitPlane";
  dayClockOrbitPlaneGroup.userData.nyePart = "day-gear-plane";
  earth.group.add(dayClockOrbitPlaneGroup);
  orientDayClockPlane(dayClockOrbitPlaneGroup, earth.group, moon.mesh);

  const dayGear = createPillarGear({
    name: "DayPillarGear",
    pillar: PILLARS.day,
    stemRadius: earthRadiusVis * 2.05,
    branchRadius: earthRadiusVis * 2.58,
    toothScale: 0.34,
    glyphStemScale: 0.4,
    glyphBranchScale: 0.48,
    couplingOpacity: 0.2
  });
  dayClockOrbitPlaneGroup.add(dayGear.group);
  group.updateMatrixWorld(true);
  const moonInDayPlane = moon.mesh.getWorldPosition(new T.Vector3());
  dayClockOrbitPlaneGroup.worldToLocal(moonInDayPlane);
  const moonOrbitAngle = Math.atan2(moonInDayPlane.y, moonInDayPlane.x);
  dayGear.branchSwivel.rotation.z = moonOrbitAngle - PILLARS.day.branchIndex * (TAU / 12);
  dayGear.stemSwivel.rotation.z = moonOrbitAngle - (PILLARS.day.stemIndex + 0.5) * (TAU / 10);
  placeLabel(dayGear.label, earthRadiusVis * 3.15, moonOrbitAngle + 0.22, 0.16);
  gearMotions.push({ target: dayGear.stemSwivel, base: dayGear.stemSwivel.rotation.z, speed: -0.0012 });
  gearMotions.push({ target: dayGear.branchSwivel, base: dayGear.branchSwivel.rotation.z, speed: 0.0010 });

  const hourLocalRingGroup = new T.Group();
  hourLocalRingGroup.name = "HeroHourLocalRing";
  hourLocalRingGroup.userData.nyePart = "hour-gear-plane";
  earth.mesh.add(hourLocalRingGroup);

  const hourGear = createPillarGear({
    name: "HourPillarGear",
    pillar: PILLARS.hour,
    stemRadius: earthRadiusVis * 1.18,
    branchRadius: earthRadiusVis * 1.38,
    toothScale: 0.23,
    glyphStemScale: 0.26,
    glyphBranchScale: 0.34,
    couplingOpacity: 0.22
  });
  hourGear.group.rotation.x = Math.PI / 2;
  hourLocalRingGroup.add(hourGear.group);
  const hourAnchor = Math.PI / 2;
  hourGear.branchSwivel.rotation.z = hourAnchor - PILLARS.hour.branchIndex * (TAU / 12);
  hourGear.stemSwivel.rotation.z = hourAnchor - (PILLARS.hour.stemIndex + 0.5) * (TAU / 10);
  hourGear.label.visible = false;
  const hourFloatingLabel = makeTextSprite("时 · 甲申", "#f4ead2", 1.0, {
    sub: "10×12 / 60"
  });
  hourFloatingLabel.name = "HourPillarReadout";
  hourFloatingLabel.position.set(0, earthRadiusVis * 2.68, 0);
  hourFloatingLabel.userData.nyePart = "hour-label";
  earth.group.add(hourFloatingLabel);
  gearMotions.push({ target: hourGear.stemSwivel, base: hourGear.stemSwivel.rotation.z, speed: 0.0015 });
  gearMotions.push({ target: hourGear.branchSwivel, base: hourGear.branchSwivel.rotation.z, speed: -0.00125 });

  const orbitTrace = buildOrbitTrace(AU_SCALE, 0xe0876a, 0.12, "EarthOrbitTrace");
  orbitTrace.quaternion.copy(eclipticGroup.quaternion);
  solarSystem.add(orbitTrace);

  markSubtree(group, { nyeArmature: true });

  return {
    group,
    tick,
    dispose
  };

  function tick(seconds) {
    const t = Number.isFinite(seconds) ? seconds : 0;
    for (let i = 0; i < animatedUniforms.length; i++) {
      animatedUniforms[i].uTime.value = t;
    }
    sun.group.rotation.y = t * 0.010;
    sun.core.rotation.y = t * 0.018;
    sun.rim.rotation.y = -t * 0.013;
    for (let i = 0; i < coronaLayers.length; i++) {
      const layer = coronaLayers[i];
      layer.mesh.rotation.y = t * (0.004 + i * 0.0016);
      layer.mesh.rotation.z = t * (i % 2 ? -0.0022 : 0.0018);
    }
    for (let i = 0; i < gearMotions.length; i++) {
      const g = gearMotions[i];
      g.target.rotation.z = g.base + t * g.speed;
    }
    earth.uniforms.uTime.value = t;
  }

  function dispose() {
    scene.remove(group);
    group.traverse(function (obj) {
      if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (let i = 0; i < mats.length; i++) disposeMaterial(mats[i]);
    });
  }

  function buildSun() {
    const sunGroup = new T.Group();
    sunGroup.name = "NyeSun";
    sunGroup.userData.nyePart = "sun";

    const sunVert = [
      "varying vec2 vUv;",
      "varying vec3 vWn;",
      "varying vec3 vWp;",
      "void main(){",
      "  vUv=uv;",
      "  vec4 wp=modelMatrix*vec4(position,1.0);",
      "  vWp=wp.xyz;",
      "  vWn=normalize(mat3(modelMatrix)*normal);",
      "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
      "}"
    ].join("\n");

    const sunNoiseGLSL = [
      "float sh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float sn(vec2 p){",
      "  vec2 i=floor(p),f=fract(p);",
      "  vec2 u=f*f*(3.0-2.0*f);",
      "  return mix(mix(sh(i),sh(i+vec2(1.0,0.0)),u.x),mix(sh(i+vec2(0.0,1.0)),sh(i+vec2(1.0,1.0)),u.x),u.y);",
      "}",
      "float sfbm(vec2 p,float t){",
      "  float v=0.0,a=0.52;",
      "  p+=vec2(t*0.009,t*0.013);",
      "  for(int i=0;i<5;i++){v+=a*sn(p);p=p*2.07+vec2(3.1,5.7);a*=0.47;}",
      "  return v;",
      "}",
      "vec3 acesApprox(vec3 x){",
      "  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);",
      "}"
    ].join("\n");

    const sunCoreFrag = sunNoiseGLSL + [
      "varying vec2 vUv; varying vec3 vWn; varying vec3 vWp;",
      "uniform float uTime;",
      "uniform float uExposure;",
      "uniform vec3 uWarmTint;",
      "void main(){",
      "  vec3 N=normalize(vWn);",
      "  vec3 V=normalize(cameraPosition-vWp);",
      "  float mu=max(dot(N,V),0.0);",
      "  float ld=0.22+0.78*mu;",
      "  float p0=sfbm(vUv*2.15+vec2(0.5,0.2),uTime*0.06);",
      "  float p1=sfbm(vUv*5.0,uTime);",
      "  float p2=sfbm(vUv*11.0+vec2(1.7,3.3),-uTime*0.6);",
      "  float p3=sfbm(vUv*19.0+vec2(4.2,1.1),uTime*0.35);",
      "  float p4=sfbm(vUv*31.0+vec2(2.1,8.3),uTime*0.42);",
      "  float plasma=0.18*p0+0.40*p1+0.28*p2+0.14*p3;",
      "  float gran=smoothstep(0.32,0.72,plasma);",
      "  vec3 cLane=vec3(1.00,0.33,0.03);",
      "  vec3 cGran=vec3(1.00,0.76,0.28);",
      "  vec3 cPhot=vec3(1.12,1.04,0.96);",
      "  vec3 col=mix(cLane,cGran,gran);",
      "  col=mix(col,cPhot,pow(mu,0.95)*0.90);",
      "  float fac=smoothstep(0.74,0.97,p1)*smoothstep(0.36,0.80,p2)*mu;",
      "  col+=vec3(0.48,0.42,0.28)*fac*0.62;",
      "  float tw=smoothstep(0.88,0.995,p2*p4)*pow(mu,0.35);",
      "  col+=vec3(1.55,1.35,1.05)*tw*0.55;",
      "  col*=(1.14+0.82*gran)*ld;",
      "  float limbE=pow(max(1.0-mu,0.0),3.2);",
      "  col+=vec3(1.0,0.36,0.10)*limbE*0.72;",
      "  float hotCore=pow(mu,2.4)*0.28;",
      "  col+=vec3(1.22,1.10,1.0)*hotCore;",
      "  col*=0.91+0.09*sin(uTime*0.21+plasma*6.8);",
      "  col=mix(col,col*uWarmTint,0.18);",
      "  col=acesApprox(col*uExposure);",
      "  gl_FragColor=vec4(col,1.0);",
      "}"
    ].join("\n");

    const sunCoreUni = {
      uTime: { value: 0 },
      uExposure: { value: warm ? 0.92 : 1.0 },
      uWarmTint: { value: warm ? new T.Vector3(1.0, 0.86, 0.72) : new T.Vector3(1.0, 1.0, 1.0) }
    };
    const sunCoreMat = new T.ShaderMaterial({
      uniforms: sunCoreUni,
      vertexShader: sunVert,
      fragmentShader: sunCoreFrag
    });
    disableToneMapping(sunCoreMat);
    const sunCoreMesh = new T.Mesh(new T.SphereGeometry(SUN_BASE_R, 120, 120), sunCoreMat);
    sunCoreMesh.name = "NyeSunCore";
    sunGroup.add(sunCoreMesh);
    animatedUniforms.push(sunCoreUni);

    const solarRimFrag = sunNoiseGLSL + [
      "varying vec2 vUv; varying vec3 vWn; varying vec3 vWp;",
      "uniform float uTime;",
      "void main(){",
      "  vec3 N=normalize(vWn);",
      "  vec3 V=normalize(cameraPosition-vWp);",
      "  float mu=max(dot(N,V),0.0);",
      "  float f=pow(1.0-mu,3.4);",
      "  float g=sfbm(vUv*14.0,uTime*0.55);",
      "  float pulse=0.86+0.14*sin(uTime*0.42);",
      "  vec3 c=vec3(2.05,0.70,0.30)*f*pulse*(0.82+0.18*g);",
      "  c=acesApprox(c*0.86);",
      "  gl_FragColor=vec4(c,clamp(f*0.92,0.0,1.0));",
      "}"
    ].join("\n");
    const solarRimUni = { uTime: { value: 0 } };
    const solarRimMat = new T.ShaderMaterial({
      uniforms: solarRimUni,
      vertexShader: sunVert,
      fragmentShader: solarRimFrag,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.FrontSide
    });
    disableToneMapping(solarRimMat);
    const solarRimMesh = new T.Mesh(new T.SphereGeometry(SUN_BASE_R * 1.022, 96, 96), solarRimMat);
    solarRimMesh.name = "NyeSunRim";
    sunGroup.add(solarRimMesh);
    animatedUniforms.push(solarRimUni);

    const coronaFrag = sunNoiseGLSL + [
      "varying vec2 vUv; varying vec3 vWn; varying vec3 vWp;",
      "uniform float uTime;",
      "uniform float uOpacity;",
      "uniform vec3 uColor;",
      "uniform float uStreamAmt;",
      "uniform float uLimbPow;",
      "void main(){",
      "  vec3 N=normalize(vWn);",
      "  vec3 V=normalize(cameraPosition-vWp);",
      "  float mu=max(dot(N,V),0.0);",
      "  float limbW=pow(1.0-mu,uLimbPow);",
      "  float w1=sfbm(vUv*2.5+vec2(uTime*0.007,0.0),uTime*0.34);",
      "  float w2=sfbm(vUv*5.0+vec2(0.0,uTime*0.011),uTime*0.52);",
      "  float w3=sfbm(vUv*9.0+vec2(uTime*0.0045,-uTime*0.0035),uTime*0.24);",
      "  float w4=sfbm(vUv*16.0+vec2(-uTime*0.003,uTime*0.005),uTime*0.31);",
      "  float wisps=0.34*w1+0.30*w2+0.22*w3+0.14*w4;",
      "  wisps=smoothstep(0.18,0.82,wisps);",
      "  float phi=atan(vWn.y,vWn.x);",
      "  float wv=sin(vWn.z*5.5+uTime*0.055);",
      "  float stream=0.68+0.32*sin(phi*14.0+uTime*0.19)*sin(phi*8.0-uTime*0.15+wv);",
      "  stream=mix(1.0,stream,uStreamAmt);",
      "  float alpha=limbW*wisps*uOpacity*stream;",
      "  gl_FragColor=vec4(uColor,clamp(alpha,0.0,1.0));",
      "}"
    ].join("\n");

    const coronaDef = [
      [1.04, 0.92, 1.28, 0.86, 0.48, 1.00, 0.52, 100],
      [1.72, 0.60, 1.18, 0.58, 0.28, 0.95, 0.64, 68],
      [3.25, 0.36, 1.02, 0.42, 0.24, 0.68, 0.76, 56],
      [5.85, 0.22, 0.90, 0.30, 0.18, 0.35, 0.92, 44]
    ];
    for (let i = 0; i < coronaDef.length; i++) {
      const cd = coronaDef[i];
      const uni = {
        uTime: { value: 0 },
        uOpacity: { value: cd[1] },
        uColor: { value: new T.Vector3(cd[2], cd[3], cd[4]) },
        uStreamAmt: { value: cd[5] },
        uLimbPow: { value: cd[6] }
      };
      const mat = new T.ShaderMaterial({
        uniforms: uni,
        vertexShader: sunVert,
        fragmentShader: coronaFrag,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.FrontSide
      });
      disableToneMapping(mat);
      const mesh = new T.Mesh(new T.SphereGeometry(SUN_BASE_R * cd[0], cd[7], cd[7]), mat);
      mesh.name = "NyeSunCorona" + (i + 1);
      sunGroup.add(mesh);
      coronaLayers.push({ mesh, uni });
      animatedUniforms.push(uni);
    }

    const pickShell = new T.Mesh(
      new T.SphereGeometry(SUN_BASE_R * 5.2, 32, 32),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })
    );
    pickShell.name = "NyeSunPickShell";
    pickShell.userData.nyePick = "sun";
    pickShell.userData.nyePart = "sun";
    sunGroup.add(pickShell);

    return { group: sunGroup, core: sunCoreMesh, rim: solarRimMesh };
  }

  function buildEarth(radius) {
    const earthTexPlaceholder = makePlaceholderTexture();
    const earthVert = [
      "varying vec2 vUv;",
      "varying vec3 vWn;",
      "varying vec3 vWp;",
      "void main(){",
      "  vUv=uv;",
      "  vec4 wp=modelMatrix*vec4(position,1.0);",
      "  vWp=wp.xyz;",
      "  vWn=normalize(mat3(modelMatrix)*normal);",
      "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
      "}"
    ].join("\n");

    const earthFrag = [
      "varying vec2 vUv; varying vec3 vWn; varying vec3 vWp;",
      "uniform vec3 uSunDirWorld; uniform float uTime;",
      "uniform sampler2D uAlbedoMap; uniform float uUseAlbedoMap;",
      "uniform sampler2D uCloudMap; uniform float uUseCloudMap;",
      "uniform sampler2D uNightMap; uniform float uUseNightMap;",
      "float eh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float en(vec2 p){",
      "  vec2 i=floor(p),f=fract(p);",
      "  vec2 u=f*f*(3.0-2.0*f);",
      "  return mix(mix(eh(i),eh(i+vec2(1.0,0.0)),u.x),mix(eh(i+vec2(0.0,1.0)),eh(i+vec2(1.0,1.0)),u.x),u.y);",
      "}",
      "float efbm(vec2 p){",
      "  float v=0.0,a=0.5;",
      "  for(int i=0;i<3;i++){v+=a*en(p);p*=2.1;a*=0.48;}",
      "  return v;",
      "}",
      "void main(){",
      "  vec3 N=normalize(vWn);",
      "  vec3 V=normalize(cameraPosition-vWp);",
      "  vec3 L=normalize(uSunDirWorld);",
      "  vec3 alb; float land; float isOcean;",
      "  if(uUseAlbedoMap>0.5){",
      "    alb=texture2D(uAlbedoMap,vUv).rgb;",
      "    land=1.0-smoothstep(0.05,0.22,alb.b-max(alb.r,alb.g));",
      "    isOcean=1.0-land;",
      "  }else{",
      "    float n=efbm(vUv*7.0+vec2(1.7,3.3));",
      "    float lat=abs(vUv.y-0.5)*2.0;",
      "    land=smoothstep(0.42,0.60,n+0.08*sin(vUv.x*18.0)-0.06*lat);",
      "    isOcean=1.0-land;",
      "    vec3 deepSea=vec3(0.01,0.06,0.22);",
      "    vec3 coast=vec3(0.03,0.14,0.35);",
      "    vec3 oceanC=mix(deepSea,coast,smoothstep(0.35,0.55,n));",
      "    vec3 tropical=vec3(0.04,0.28,0.07);",
      "    vec3 arid=vec3(0.36,0.26,0.10);",
      "    vec3 tundra=vec3(0.28,0.30,0.22);",
      "    vec3 iceC=vec3(0.82,0.88,0.95);",
      "    float aridF=smoothstep(0.15,0.55,lat);",
      "    float iceF=smoothstep(0.75,0.95,lat);",
      "    vec3 landC=mix(mix(tropical,arid,aridF),mix(tundra,iceC,iceF*0.8),iceF);",
      "    alb=mix(oceanC,landC,land);",
      "    alb=mix(alb,iceC,iceF*0.85);",
      "  }",
      "  float mu=dot(N,L);",
      "  float terminator=smoothstep(-0.085,0.155,mu);",
      "  float dayAmt=max(mu,0.0);",
      "  vec3 dayDiff=alb*(0.028+1.05*dayAmt);",
      "  float spec=pow(max(dot(reflect(-L,N),V),0.0),72.0)*0.38*isOcean*terminator;",
      "  vec3 daySurf=dayDiff+vec3(spec);",
      "  float nightAmt=1.0-terminator;",
      "  vec3 nightSurf;",
      "  if(uUseNightMap>0.5){",
      "    vec3 nl=texture2D(uNightMap,vUv).rgb;",
      "    float lum=dot(nl,vec3(0.3,0.5,0.2));",
      "    vec3 lights=nl*vec3(1.0,0.82,0.58)*smoothstep(0.02,0.65,lum)*0.26;",
      "    nightSurf=alb*0.038+lights*nightAmt;",
      "  }else{",
      "    float cityN=en(vUv*80.0+vec2(uTime*0.001,0.0))*en(vUv*22.0);",
      "    float cityMask=nightAmt*smoothstep(0.45,0.85,1.0-land)*cityN;",
      "    nightSurf=alb*0.032+vec3(0.75,0.62,0.38)*cityMask*0.045;",
      "  }",
      "  if(uUseCloudMap>0.5){",
      "    vec4 cl=texture2D(uCloudMap,vUv);",
      "    float cv=clamp(cl.r*cl.a+cl.g*0.1,0.0,1.0);",
      "    daySurf=mix(daySurf,vec3(0.92,0.94,1.0)*terminator,cv*0.55);",
      "    nightSurf=mix(nightSurf,vec3(0.0),cv*0.4);",
      "  }",
      "  vec3 surface=mix(nightSurf,daySurf,terminator);",
      "  float fres=pow(1.0-max(dot(N,V),0.0),3.2);",
      "  float atGate=smoothstep(0.12,0.55,terminator);",
      "  vec3 atmoDayC=vec3(0.16,0.48,0.98)*fres*0.52*atGate;",
      "  vec3 atmoNightC=vec3(0.03,0.08,0.28)*fres*0.14;",
      "  vec3 atmo=atmoDayC+atmoNightC;",
      "  gl_FragColor=vec4(surface+atmo,1.0);",
      "}"
    ].join("\n");

    const uniforms = {
      uSunDirWorld: { value: new T.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uAlbedoMap: { value: earthTexPlaceholder },
      uUseAlbedoMap: { value: 0 },
      uCloudMap: { value: earthTexPlaceholder },
      uUseCloudMap: { value: 0 },
      uNightMap: { value: earthTexPlaceholder },
      uUseNightMap: { value: 0 }
    };
    const mat = new T.ShaderMaterial({ uniforms, vertexShader: earthVert, fragmentShader: earthFrag });
    disableToneMapping(mat);

    const earthGroup = new T.Group();
    earthGroup.name = "NyeEarth";
    earthGroup.userData.nyePart = "earth";

    const earthMesh = new T.Mesh(new T.SphereGeometry(radius, 128, 128), mat);
    earthMesh.name = "NyeEarthMesh";
    earthMesh.userData.nyePick = "earth";
    earthMesh.userData.nyePart = "earth";
    earthGroup.add(earthMesh);

    const pickShell = new T.Mesh(
      new T.SphereGeometry(radius * 2.35, 48, 48),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })
    );
    pickShell.name = "NyeEarthPickShell";
    pickShell.userData.nyePick = "earth";
    pickShell.userData.nyePart = "earth";
    earthGroup.add(pickShell);

    const atmo = new T.Mesh(
      new T.SphereGeometry(radius * 1.14, 72, 72),
      new T.MeshBasicMaterial({
        color: 0x55aaff,
        transparent: true,
        opacity: 0.20,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.BackSide
      })
    );
    atmo.name = "NyeEarthAtmosphere";
    earthGroup.add(atmo);

    const atmo2 = new T.Mesh(
      new T.SphereGeometry(radius * 1.28, 64, 64),
      new T.MeshBasicMaterial({
        color: 0x3366cc,
        transparent: true,
        opacity: 0.06,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.BackSide
      })
    );
    atmo2.name = "NyeEarthOuterHaze";
    earthGroup.add(atmo2);

    return { group: earthGroup, mesh: earthMesh, uniforms, vertexShader: earthVert };
  }

  function buildMoon(radius) {
    const moonTexPlaceholder = makePlaceholderTexture();
    const moonVert = [
      "varying vec2 vUv;",
      "varying vec3 vWn;",
      "varying vec3 vWp;",
      "void main(){",
      "  vUv=uv;",
      "  vec4 wp=modelMatrix*vec4(position,1.0);",
      "  vWp=wp.xyz;",
      "  vWn=normalize(mat3(modelMatrix)*normal);",
      "  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);",
      "}"
    ].join("\n");
    const moonFrag = [
      "varying vec2 vUv; varying vec3 vWn; varying vec3 vWp;",
      "uniform vec3 uSunDirWorld;",
      "uniform sampler2D uAlbedoMap; uniform float uUseAlbedoMap;",
      "float mh(vec2 p){ return fract(sin(dot(p,vec2(41.2,289.1)))*758.5453);}",
      "float mn2(vec2 p){ return mh(p)+0.5*mh(p*2.3)+0.25*mh(p*5.1);}",
      "float mn4(vec2 p){ return mn2(p)+0.125*mn2(p*9.2);}",
      "void main(){",
      "  vec3 N=normalize(vWn);",
      "  vec3 V=normalize(cameraPosition-vWp);",
      "  vec3 L=normalize(uSunDirWorld);",
      "  float ndl=dot(N,L);",
      "  vec3 base;",
      "  if(uUseAlbedoMap>0.5){",
      "    base=texture2D(uAlbedoMap,vUv).rgb;",
      "    float mic=0.90+0.10*mn2(vUv*155.0);",
      "    base*=mic;",
      "  }else{",
      "    float cr=mn4(vUv*14.0); float mar=mn2(vUv*3.7); float pit=mn2(vUv*33.0+mar);",
      "    base=mix(vec3(0.46,0.46,0.50),vec3(0.74,0.74,0.80),mar*0.40);",
      "    base*=0.82+cr*0.20;",
      "    base-=vec3(0.045)*smoothstep(0.32,0.74,pit);",
      "  }",
      "  float sunLit=max(ndl,0.0);",
      "  float twilight=smoothstep(-0.24,0.20,ndl);",
      "  vec3 diff=base*(0.045+sunLit*1.02);",
      "  float darkAmt=1.0-twilight;",
      "  vec3 earthGlow=vec3(0.075,0.105,0.19)*darkAmt*0.52;",
      "  float fr=pow(1.0-max(dot(N,V),0.0),3.05);",
      "  vec3 rimCol=vec3(0.50,0.58,0.72)*fr*0.50;",
      "  float sp=pow(max(dot(reflect(-L,N),V),0.0),88.0)*0.15*smoothstep(0.03,0.28,ndl);",
      "  vec3 c=diff+earthGlow+rimCol+vec3(sp);",
      "  gl_FragColor=vec4(c,1.0);",
      "}"
    ].join("\n");
    const uniforms = {
      uSunDirWorld: { value: new T.Vector3(0, 0, 1) },
      uAlbedoMap: { value: moonTexPlaceholder },
      uUseAlbedoMap: { value: 0 }
    };
    const mat = new T.ShaderMaterial({ uniforms, vertexShader: moonVert, fragmentShader: moonFrag });
    disableToneMapping(mat);
    const mesh = new T.Mesh(new T.SphereGeometry(radius, 96, 96), mat);
    mesh.name = "NyeMoon";
    mesh.userData.nyePart = "moon";
    mesh.userData.nyePick = "moon";

    const rim = new T.Mesh(
      new T.SphereGeometry(radius * 1.038, 64, 64),
      new T.MeshBasicMaterial({
        color: 0x9eb8e8,
        transparent: true,
        opacity: 0.12,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.BackSide
      })
    );
    rim.name = "NyeMoonRim";
    mesh.add(rim);

    const pickShell = new T.Mesh(
      new T.SphereGeometry(radius * 2.9, 24, 24),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })
    );
    pickShell.name = "NyeMoonPickShell";
    pickShell.userData.nyePick = "moon";
    pickShell.userData.nyePart = "moon";
    mesh.add(pickShell);

    moonUniformsRef = uniforms;
    return { mesh, uniforms };
  }

  function createPillarGear(config) {
    const pillar = config.pillar;
    const gear = new T.Group();
    gear.name = config.name;
    gear.userData.nyePart = pillar.slot + "-pillar";
    gear.userData.pillar = pillar.pair;
    gear.userData.index60 = pillar.index60;

    const stemSwivel = new T.Group();
    stemSwivel.name = config.name + "Stem10ToothSwivel";
    stemSwivel.userData.nyePart = pillar.slot + "-stem-ring";
    const branchSwivel = new T.Group();
    branchSwivel.name = config.name + "Branch12ToothSwivel";
    branchSwivel.userData.nyePart = pillar.slot + "-branch-ring";

    const stemTrack = makeTorus(config.stemRadius, 0.024 * config.toothScale, 0xe0876a, 0.22, "StemTrack10");
    const branchTrack = makeTorus(config.branchRadius, 0.026 * config.toothScale, 0xf0c08c, 0.20, "BranchTrack12");
    stemSwivel.add(stemTrack);
    branchSwivel.add(branchTrack);

    const toothStemMat = makeBasic(0xe0876a, 0.28, T.AdditiveBlending);
    const toothStemActiveMat = makeBasic(0xf4ead2, 0.68, T.AdditiveBlending);
    const toothBranchMat = makeBasic(0xc8a961, 0.24, T.AdditiveBlending);
    const toothBranchActiveMat = makeBasic(0xffc69a, 0.66, T.AdditiveBlending);
    addToothSet(stemSwivel, 10, config.stemRadius, 0.18 * config.toothScale, 0.58 * config.toothScale, 0.038 * config.toothScale, pillar.stemIndex, toothStemMat, toothStemActiveMat, "stem");
    addToothSet(branchSwivel, 12, config.branchRadius, 0.17 * config.toothScale, 0.68 * config.toothScale, -0.038 * config.toothScale, pillar.branchIndex, toothBranchMat, toothBranchActiveMat, "branch");

    const coupling = makeRadialTicks(config.stemRadius + 0.26 * config.toothScale, config.branchRadius - 0.26 * config.toothScale, 60, 0.012, 0xe0876a, config.couplingOpacity);
    coupling.name = config.name + "Base60CouplingTicks";
    coupling.userData.nyePart = pillar.slot + "-base60-coupling";
    gear.add(coupling);

    const activeAngle60 = (pillar.index60 / 60) * TAU;
    const activeBead = new T.Mesh(
      new T.SphereGeometry(0.10 * config.toothScale + 0.035, 18, 18),
      makeBasic(0xf4ead2, 0.86, T.AdditiveBlending)
    );
    activeBead.name = config.name + "ActiveBase60Bead";
    activeBead.position.set(
      ((config.stemRadius + config.branchRadius) * 0.5) * Math.cos(activeAngle60),
      ((config.stemRadius + config.branchRadius) * 0.5) * Math.sin(activeAngle60),
      0.13 * config.toothScale
    );
    activeBead.userData.nyePart = pillar.slot + "-base60-active";
    activeBead.userData.nyePick = pillar.slot;
    gear.add(activeBead);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const sprite = makeGlyphSprite(STEMS[i], i === pillar.stemIndex ? "#f4ead2" : STEM_COLORS[i], config.glyphStemScale, i === pillar.stemIndex);
      sprite.name = config.name + "StemGlyph_" + STEMS[i];
      sprite.position.set(config.stemRadius * Math.cos(a), config.stemRadius * Math.sin(a), 0.19 * config.toothScale);
      sprite.userData.nyePart = pillar.slot + "-stem-glyph";
      sprite.userData.nyePick = pillar.slot;
      sprite.userData.stemIndex = i;
      stemSwivel.add(sprite);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const sprite = makeGlyphSprite(BRANCHES[i], i === pillar.branchIndex ? "#ffbf9a" : BRANCH_COLORS[i], config.glyphBranchScale, i === pillar.branchIndex);
      sprite.name = config.name + "BranchGlyph_" + BRANCHES[i];
      sprite.position.set(config.branchRadius * Math.cos(a), config.branchRadius * Math.sin(a), 0.23 * config.toothScale);
      sprite.userData.nyePart = pillar.slot + "-branch-glyph";
      sprite.userData.nyePick = pillar.slot;
      sprite.userData.branchIndex = i;
      branchSwivel.add(sprite);
    }

    gear.add(stemSwivel);
    gear.add(branchSwivel);

    const label = makeTextSprite(pillar.label + " · " + pillar.pair, "#f4ead2", Math.max(0.72, config.glyphBranchScale), {
      sub: "10×12 / 60"
    });
    label.name = config.name + "Readout";
    label.userData.nyePart = pillar.slot + "-label";
    label.userData.nyePick = pillar.slot;
    gear.add(label);

    return { group: gear, stemSwivel, branchSwivel, label };
  }

  function addToothSet(parent, count, radius, tangentWidth, radialLength, z, activeIndex, mat, activeMat, kind) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const mesh = new T.Mesh(new T.BoxGeometry(tangentWidth, radialLength, Math.max(0.012, radialLength * 0.08)), i === activeIndex ? activeMat : mat);
      mesh.name = kind + "Tooth_" + i;
      mesh.position.set(radius * Math.cos(a), radius * Math.sin(a), z);
      mesh.rotation.z = a - Math.PI / 2;
      mesh.userData.nyeGearTooth = kind;
      parent.add(mesh);
    }
  }

  function makeGlyphSprite(char, color, sizeScale, active) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 43, 0, TAU);
    ctx.fillStyle = "rgba(11,10,9,0.62)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = active ? 3.2 : 2.1;
    ctx.globalAlpha = active ? 0.78 : 0.46;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = (active ? "700 " : "600 ") + '48px "Songti SC","STSong","Noto Serif SC",serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, 64, 66);

    const tex = new T.CanvasTexture(cv);
    setTextureColorSpace(tex);
    const mat = new T.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: active ? 0.96 : 0.62,
      depthWrite: false,
      blending: T.NormalBlending
    });
    disableToneMapping(mat);
    const sprite = new T.Sprite(mat);
    const scale = 2.15 * sizeScale * (active ? 1.12 : 1);
    sprite.scale.set(scale, scale, 1);
    sprite.center.set(0.5, 0.5);
    sprite.userData.char = char;
    sprite.userData.baseOpacity = mat.opacity;
    return sprite;
  }

  function makeTextSprite(text, color, scale, extra) {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 192;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    const grad = ctx.createRadialGradient(256, 96, 0, 256, 96, 230);
    grad.addColorStop(0, "rgba(224,135,106,0.18)");
    grad.addColorStop(0.55, "rgba(58,21,24,0.16)");
    grad.addColorStop(1, "rgba(11,10,9,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = color;
    ctx.font = '600 48px "Songti SC","STSong","Noto Serif SC",serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 78);
    ctx.fillStyle = "rgba(240,228,203,0.62)";
    ctx.font = '500 22px "JetBrains Mono","SFMono-Regular",monospace';
    ctx.fillText(extra && extra.sub ? extra.sub : "10×12 / 60", 256, 126);
    const tex = new T.CanvasTexture(cv);
    setTextureColorSpace(tex);
    const mat = new T.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: T.NormalBlending
    });
    disableToneMapping(mat);
    const sprite = new T.Sprite(mat);
    sprite.scale.set(5.6 * scale, 2.1 * scale, 1);
    return sprite;
  }

  function placeLabel(sprite, radius, angle, z) {
    sprite.position.set(radius * Math.cos(angle), radius * Math.sin(angle), z || 0);
  }

  function makeRadialTicks(r0, r1, count, z, color, opacity) {
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos[i * 6] = r0 * c;
      pos[i * 6 + 1] = r0 * s;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = r1 * c;
      pos[i * 6 + 4] = r1 * s;
      pos[i * 6 + 5] = z;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const mat = new T.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: T.AdditiveBlending,
      depthWrite: false
    });
    disableToneMapping(mat);
    return new T.LineSegments(geo, mat);
  }

  function buildOrbitTrace(radius, color, opacity, name) {
    const line = makeRadialTicks(radius, radius + 0.001, 240, -0.11, color, opacity);
    line.name = name;
    return line;
  }

  function makeTorus(radius, tube, color, opacity, name) {
    const mesh = new T.Mesh(new T.TorusGeometry(radius, tube, 8, 192), makeBasic(color, opacity, T.AdditiveBlending));
    mesh.name = name;
    mesh.userData.nyePart = name;
    return mesh;
  }

  function makeBasic(color, opacity, blending) {
    const mat = new T.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      blending: blending || T.NormalBlending,
      depthWrite: false
    });
    disableToneMapping(mat);
    return mat;
  }

  function makePlaceholderTexture() {
    const d = new Uint8Array([255, 255, 255, 255]);
    const tex = new T.DataTexture(d, 1, 1, T.RGBAFormat);
    tex.needsUpdate = true;
    setTextureColorSpace(tex);
    return tex;
  }

  function setLightDirections() {
    const sunPos = new T.Vector3(0, 0, 0);
    const earthLight = sunPos.clone().sub(earth.group.position);
    if (earthLight.lengthSq() < 1e-12) earthLight.set(0, 0, 1);
    else earthLight.normalize();
    earth.uniforms.uSunDirWorld.value.copy(earthLight);

    if (moonUniformsRef) {
      const moonLight = sunPos.clone().sub(moon.mesh.position);
      if (moonLight.lengthSq() < 1e-12) moonLight.copy(earthLight);
      else moonLight.normalize();
      moonUniformsRef.uSunDirWorld.value.copy(moonLight);
    }
  }

  function orientDayClockPlane(dayGroup, earthGroupRef, moonMeshRef) {
    moonMeshRef.updateMatrixWorld(true);
    earthGroupRef.updateMatrixWorld(true);
    const mw = moonMeshRef.getWorldPosition(new T.Vector3());
    const ew = earthGroupRef.getWorldPosition(new T.Vector3());
    const dir = mw.sub(ew);
    if (dir.lengthSq() < 1e-14) return;
    dir.normalize();
    const normal = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0));
    if (normal.lengthSq() < 1e-10) normal.crossVectors(dir, new T.Vector3(1, 0, 0));
    normal.normalize();
    dayGroup.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
  }

  function computeFrozenEphemeris(date) {
    const earthPos = vecEarthHelio(date);
    const moonPos = vecMoonHelio(date);
    const d2 = new Date(date.getTime() + 91 * 86400000);
    const earthFuture = vecEarthHelio(d2);
    const normal = new T.Vector3().crossVectors(earthPos.clone().normalize(), earthFuture.clone().normalize());
    if (normal.lengthSq() < 1e-10) normal.set(0, 1, 0);
    else normal.normalize();
    return {
      earth: earthPos,
      moon: moonPos,
      eclipticNormal: normal
    };
  }

  function vecEarthHelio(d) {
    const A = getAstronomy();
    if (A && A.HelioVector && A.Body && Object.prototype.hasOwnProperty.call(A.Body, "Earth")) {
      try {
        return helioToScene(A.HelioVector(A.Body.Earth, A.MakeTime ? A.MakeTime(d) : d));
      } catch (e) {}
    }
    return vecEarthHelioKepler(d);
  }

  function vecMoonHelio(d) {
    const A = getAstronomy();
    if (A && A.HelioVector && A.Body && Object.prototype.hasOwnProperty.call(A.Body, "Moon")) {
      try {
        return helioToScene(A.HelioVector(A.Body.Moon, A.MakeTime ? A.MakeTime(d) : d));
      } catch (e) {}
    }
    const ev = vecEarthHelio(d);
    const ang = (d.getTime() / 86400000) * (TAU / 27.321661);
    const inc = (5.145 * Math.PI) / 180;
    const dist = 0.002569 * AU_SCALE;
    const lx = Math.cos(ang) * dist;
    const ly = Math.sin(ang) * Math.cos(inc) * dist;
    const lz = Math.sin(ang) * Math.sin(inc) * dist;
    return ev.clone().add(new T.Vector3(lx, lz, -ly));
  }

  function vecEarthHelioKepler(d) {
    const y = d.getUTCFullYear();
    const t0 = Date.UTC(y, 0, 1, 12, 0, 0);
    const day = (d.getTime() - t0) / 86400000;
    const periDay = 2.4;
    const M = (TAU / 365.256) * (day - periDay);
    const e = 0.0167086;
    let E = M;
    for (let i = 0; i < 14; i++) E = M + e * Math.sin(E);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const a = 1;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    const xo = r * Math.cos(nu) - a * e;
    const yo = r * Math.sin(nu);
    const obl = (23.4392911 * Math.PI) / 180;
    const xe = xo;
    const ye = yo * Math.cos(obl);
    const ze = yo * Math.sin(obl);
    return new T.Vector3(xe * AU_SCALE, ze * AU_SCALE, -ye * AU_SCALE);
  }

  function helioToScene(v) {
    return new T.Vector3(v.x * AU_SCALE, v.z * AU_SCALE, -v.y * AU_SCALE);
  }

  function getAstronomy() {
    if (typeof globalThis !== "undefined" && globalThis.Astronomy) return globalThis.Astronomy;
    if (typeof window !== "undefined" && window.Astronomy) return window.Astronomy;
    return null;
  }

  function siderealOrFallbackRotationY(d) {
    const A = getAstronomy();
    if (A && A.SiderealTime) {
      try {
        return A.SiderealTime(A.MakeTime ? A.MakeTime(d) : d) * (Math.PI / 12);
      } catch (e) {}
    }
    return (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) * (Math.PI / 12);
  }

  function sexagenaryIndex(stemIndex, branchIndex) {
    const s = ((stemIndex % 10) + 10) % 10;
    const b = ((branchIndex % 12) + 12) % 12;
    for (let k = 0; k < 60; k++) {
      if (k % 10 === s && k % 12 === b) return k;
    }
    return -1;
  }

  function setTextureColorSpace(tex) {
    if (!tex) return;
    if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    else if ("encoding" in tex && T.sRGBEncoding) tex.encoding = T.sRGBEncoding;
  }

  function disableToneMapping(mat) {
    if (!mat) return;
    if ("toneMapped" in mat) mat.toneMapped = false;
  }

  function markSubtree(root, data) {
    root.traverse(function (obj) {
      for (const key in data) obj.userData[key] = data[key];
    });
  }

  function disposeMaterial(mat) {
    if (!mat) return;
    if (mat.map && mat.map.dispose) mat.map.dispose();
    if (mat.alphaMap && mat.alphaMap.dispose) mat.alphaMap.dispose();
    if (mat.dispose) mat.dispose();
  }
}
