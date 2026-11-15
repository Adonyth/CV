# 站点内容图谱 v4 · The Content Atlas (build 31 起, 2026-07-02)

> 内容清单最近一次按 `data/works.json` 核对:2026-11-14(31 项:科学研究 24 / 人文社科 4 / 著作 3)。

> **硬规矩一**:全站除「完整履历 ↗」按钮外,任何入口严禁指向 cv.html。
> **硬规矩二**:研究按**课题本身**命名,不出现仓库名/品牌名(ACAEXPL、Boltzmann、WMDB、Omytea 等)。
> **硬规矩三**:导览栏只放**内容分类**(研究/履历/创造/足迹)。命盘、太阳、月亮、星座
> 永远不做菜单项——它们是场景里的**象征性 UI**(点击天体本身),图已呈现,菜单不复述。
> **硬规矩四**:个人网站只讲**客观内容**。不设"内心自述"类页面;月亮是纯粹的命盘意象,无内容挂载。
> **硬规矩五**:未建成的页面不上按钮。

## 〇、真实天象(pyephem 历表核实 2026-07-02;出生 2002-01-02 申时)

- 太阳 摩羯座 11.8°(λ=281.75°)✓ 场景已对准
- 月亮 狮子座 20.5°(λ=140.54°)✓
- **木星 巨蟹座 10.5°(λ=100.48°),距日 178.7°——出生当夜正值冲日,mag −2.6,整夜全天最亮行星**
- **土星 双子座 9.2°(λ=69.24°)**,mag −0.3
- 场景落位直接用上表黄经;木星条纹、土星环按真实观感建模。
- 弐时仪遗留的四柱"读数牌"(年·辛巳等 + 10×12/60 副标)已永久隐藏——环上干支自会言说。

## 一、内容分类(导览栏的四类 + 唯一 CV 入口)

### 1. 研究 Research
> 本节由 `data/works.json` 生成(2026-11-14):全站 31 项 = 科学研究 24 / 人文社科 4 / 著作 3。
> 标题、时间与阶段以 works.json 为唯一来源;阶段一律取最保守的真实表述。
> 「星点」= 该项在 `data/natal-sky.json` 中有 dataNode(摩羯座 20 个、双子座 3 个);其余项只有页面,经菜单与搜索到达。

**科学研究(24 题,摩羯座·日座主外)**
| # | 课题 | 领域 / 单位 | 时间 | 阶段 | 星点 | 页面 |
|---|---|---|---|---|---|---|
| 1 | 密度矩阵信念态世界模型 | 预测与科学软件 | 2026 — | 研究原型 | ✦ | `research/worldmodel.html` |
| 2 | 算法理想主义的模块化识别需要什么:一个基础性界定 | 物理基础 | 2024.05–2024.08 | 未发表工作手稿 | ✦ | `research/paperA.html` |
| 3 | 通用先验不选出分解 | 物理基础 | 2024.05–2024.08 | 早期未发表手稿 | ✦ | `research/paperB.html` |
| 4 | 通用先验自身无法选出优先分解:有界字母表下的局域性不可行定理,及同一缺口在玻恩规则推导中的逐路线映射 | 物理基础 | 2024.05–2024.08 | 公开预印本 · 2026 年 7 月 | ✦ | `research/paperB2.html` |
| 5 | 观察者态本体论下的玻尔兹曼大脑 | 物理哲学 | 2024.05–2024.08 | 未发表研究材料 | ✦ | `research/paperC1.html` |
| 6 | 观察者态本体论下的他心问题 | 物理哲学 | 2024.05–2024.08 | 未发表研究材料 | ✦ | `research/paperC2.html` |
| 7 | 半直线自由费米子局域模数据的收敛，以及原始固定截断全局拟等价的局域性／通带障碍 | 数学物理 | 2024.05–2024.08 | 公开预印本 · 第二版，2026 年 7 月 31 日 | ✦ | `research/paperD.html` |
| 8 | X(2370) → ηηη 中的相干奇异流贡献 | 粒子现象学 | 2026.08 | 未发表手稿 | ✦ | `research/glueball.html` |
| 9 | 平移共轭循环旋转的数位依赖 | 离散数学与计算 | 2024.05–2024.08 | 未发表手稿 | ✦ | `research/digitRotation.html` |
| 10 | 玻恩规则与自然性 | 物理基础 | 2024.05–2024.08 | 暂停的研究方向 | ✦ | `research/bornNaturalness.html` |
| 11 | 铃宕泛音检验的校准诊断 | 引力波推断 | 2024.06; analysis 2026 | 已投稿手稿 · Astronomy and Computing，2026 年 10 月 | ✦ | `research/ringdown.html` |
| 12 | 强过冷相变动力学与快子模式 | 粒子理论与相变动力学 | 2025.09; comparison 2026.10 | 未发表的计算与理论研究 | ✦ | `research/tachyon.html` |
| 13 | 族群特征显著性与有限选择模拟 | 族群推断与统计诊断 | 2026 | 未发表分析与手稿 | ✦ | `research/gwPopulation.html` |
| 14 | PYTHIA 指导学习：部分子簇射与喷注结构 | 布朗大学 | 2025.05–2025.09 | 指导学习与练习 | ✦ | `research/cmsJets.html` |
| 15 | 碳纳米管热学表征（3ω 方法） | 布朗大学 Kuehne 组 | 2025.10–2026.02 | 参与研究 | ✦ | `research/cnt3omega.html` |
| 16 | 耀变体喷流的形成机制 | 天体物理 · UCL 研究项目 | 2022.07–2023.01 | 已发表会议论文 · 2023 | ✦ | `research/blazar.html` |
| 17 | 在束 γ 射线能谱学 | 核能谱 · 山东大学 | 2022 | 本科训练 | ✦ | `research/gammaSpec.html` |
| 18 | 耀变体 γ 能谱中的类轴子粒子 | 暗物质现象学 · 北京师范大学 | 2022.03–2022.05 | 本科阶段项目 | ✦ | `research/alpDM.html` |
| 19 | MAXI J1348-630 黑洞 X 射线双星 | X 射线天体物理 · 山东大学 | 2023.09–2024.05 | 本科毕业论文（分析训练） | ✦ | `research/maxi.html` |
| 20 | TOI 恒星耀发光谱 | 恒星光谱 · 山东大学 | 2022.04–2023.04 | 已完成本科研究 | ✦ | `research/toiFlares.html` |
| 21 | The Well：科学模拟评估 | 科学机器学习与评估 | 2026.07 | 研究进行中；软件贡献已合入 | — | `research/theWell.html` |
| 22 | 语言模型校准与统计识别 | AI 评估与数理统计 | 2026 | 未发表的实证与理论研究 | — | `research/calibration.html` |
| 23 | GW250114：后验约定与排除诊断 | 引力波推断 | 2026.06 | 未发表后验再分析 | — | `research/gw250114.html` |
| 24 | 有限寄存器局域性与机器相关排序 | 数学基础与计算 | 2024.05–2024.08; manuscript 2026.09 | 未发表工作手稿 | — | `research/finiteRegister.html` |

**人文社科研究(4 题,双子座+土星·文字之座)**
| # | 课题 | 领域 / 单位 | 时间 | 阶段 | 星点 | 页面 |
|---|---|---|---|---|---|---|
| 1 | 生成式 AI 中的推理租金：知识垄断与非竞争性能力的计量访问 | 技术政治经济学 | 2026.01–2026.07 | 公开 SSRN 预印本 · 2026 年 9 月修订 | ✦ | `humanities/monopolyRent.html` |
| 2 | 前沿 AI 与垄断自我纠正的局限：推理租金、算力瓶颈与平台锁定 | 政治经济学与产业组织 | 2026.01–2026.07 | 公开 SSRN 预印本 | ✦ | `humanities/stackPower.html` |
| 3 | 相机、棋手、引擎：书写自身身处其中之系统的认识论 | 认识论与社会研究 | 2026.01–2026.07 | 公开 SSRN 预印本 | ✦ | `humanities/cpe.html` |
| 4 | 公共 AI 算力计划公开记录的文献研究 | 技术政策与文献记录研究 | 2026.01–2026.07 | 工作手稿 | — | `humanities/publicAICompute.html` |

### 2. 履历 Journey(太阳本体 ☉)
山东大学(威海)空间科学与技术理学学士 2020–2024 → Brown University 物理学理学硕士 2024–2026。
研究与训练时间轴:γ 能谱训练(2022)→ ALP(2022)→ TOI(2022–23)→ 耀变体/UCL(2022–23)→ MAXI 本科毕业论文(2023–24)→ PYTHIA 指导学习(2025)→ 碳纳米管 3ω 研究参与(2025–26)。
**不写"独立研究者"。**

### 3. 创造 Creation
| 子类 | 内容 | 场所 | 打开方式 |
|---|---|---|---|
| **著作**(3 本) | An Invitation After Abundance(自行出版著作 · 2026) · 和平请柬(自行出版著作 · 2026) · Sovereign Scintillation Over Grand Fluctuation(未出版著作手稿) | 巨蟹座+木星(出版之星·冲日) | books/<id>.html |
| **产品**(3 个) | Omytea · Swindo · 弐时仪 Nye Clock | 见 v6(一物一页) | products/<id>.html(官方外链在页内) |
| **音乐**(演奏) | 中国民族管弦乐团 · gamelan(甘美兰)· 中国古琴 —— **具体细节(团名/年代/照片/录音)待用户提供** | 狮子座(主内之火·舞台之座) | music.html 或逐项页 |

### 4. 足迹 Footprint(地球 ⊕)✓ 已建成 → footprint.html

## 二、场所总表(场景象征 UI ↔ 内容)

| 场所 | 天象依据 | 内容 | 页面 |
|---|---|---|---|
| 太阳本体 ☉ | 日在摩羯 11.8° | 履历 | journey.html |
| 摩羯座星 | 日座·主外 | 科学研究 24 题(20 题有星点) | research/<id>.html |
| 土星 ♄ + 双子座星 | 土星真实在双子 9.2° | 人文社科 4 题(3 题有星点) | humanities/<id>.html |
| 木星 ♃ + 巨蟹座星 | 木星真实在巨蟹 10.5°·冲日 | 著作 3 本 | books/<id>.html |
| 狮子座星 | 月座·主内之火 | 产品 + 音乐(现行落位见 v6) | products/<id>.html / music.html |
| 月亮本体 ☾ | 月在狮子 20.5° | **纯意象,无内容挂载** | — |
| 地球 ⊕ | — | 足迹 ✓ | footprint.html ✓ |

## 三、导览栏(顶部横栏 = 四分类 + CV;≤1360px 右上降档)

> 三、四、五节是 build 31–34 时的建造记录,其中的数量(18 星、23 页、著作 2、产品 2 等)是当时的数字;现行数量见第一节。

```
研究 [科学研究 ✓(暂:飞向摩羯)|人文社科(待土星+页面)]
履历 (暂:飞向太阳;journey.html 建成后到站开门)
创造 [著作(待木星+页面)|Omytea ↗ ✓|弐时仪 ↗ ✓|音乐(待内容)]
⊕ 足迹 ✓
完整履历 ↗(唯一 cv 入口)
```

## 四、建造顺序

1. ✅ journey.html(build 32)→ 履历按钮到站开门 + 太阳 hover CTA
2. ✅ 木星+土星入盘(build 33:黄经/黄纬精确落位、临边变暗条纹、土星环+卡西尼缝、
   scene 点击即巡航、tour('jupiter'/'saturn') 独显隐环;木星与太阳实测点积 −1.000 正冲)
3. ✅ 摩羯 18 星重排 + 全部 28 星点接线(build 34):18 研究星→research/<id>.html,
   双子 3 星→humanities/,巨蟹 2 星→books/,狮子 5 星→产品官方直链+music.html
4. ✅ 23 个独立内容页 + 3 索引页(scripts/gen-works.py ← data/works.json)+ music.html;
   journey.html 收敛为纯求学履历(研究经历移入研究类)
5. ✅ 导览四分类全量接口(研究[科学18/人文社科3]/履历/创造[著作2/音乐/产品2]/足迹+CV)
6. ✅ 任意元素可为旋转中心:focusConstellation(点击星座本体即聚焦,枢轴=星座质心,
   相机站带内向外看——日/地/环全在身后,结构性不可遮挡);天体点击枢轴随行(build 33)
7. 待:行星 hover CTA 扩展(木星→books.html/土星→humanities.html);音乐素材细化

## 五、当前状态(build 31)

- 导览栏 = 研究/履历/创造/足迹 + CV,Chart 组已撤(命盘=图自身,不入菜单)✓
- EN/中文双语在 1440/1280 均无名片重叠(断点 1360)✓
- 四柱读数牌(年·辛巳…10×12/60)永久隐藏 ✓
- 太阳/月亮独显隐环、cv 唯一入口、手风琴收合——build 29/30 已上线 ✓

## v5 addendum — THE BASE (根据地), build 58–59
The site opens as an open-world: IP → the visitor's city → wake LYING ON THE GROUND
there (aimed at the richest sky object), beacon planted, horizon glow at the visible
limb (dips ~14° at this eye height). Every departure is a choreographed LAUNCH
(log-radius easeInOutCubic, eastward arc); every homecoming a soft landing
(easeOutCubic). The beacon is a door: click from orbit → come home. Mobile: 3D is
tap-to-enter from the flat menu ("✦ 进入星空"), sticky via cv-motion, ✕ 简洁版 exits.

## v6 — ONE OBJECT · ONE PAGE · ONE ANCHOR (build 67)
The aggregates are dead (research.html/humanities.html/books.html deleted; the SKY is
the only index). Canonical mapping:
  Capricorn     → research/<id>.html   (24 science topics, each its own page AND its own star — 2026-11-14:
                  four real Capricornus stars added for the four that had none: τ, 46, 41, φ Cap)
  Gemini        → humanities/<id>.html (4 topics, each its own star — the fourth sits on μ Gem)
  Jupiter       → books/invitation.html   (An Invitation After Abundance)
  Saturn        → books/sovereign.html    (Sovereign Scintillation)
  Neptune       → books/heping.html       (和平请柬 — third book, added 2026-10; anchored 2026-11-14)
  Venus         → products/omytea.html    (all Omytea links INSIDE the page)
  Mercury       → products/nyeclock.html  (弐时仪)
  Uranus        → products/swindo.html    (Swindo — anchored 2026-11-14)
  Moon          → music.html · Sun → journey.html · Earth → footprint
  Mars          → doorless sightseeing · Cancer/Leo → pure constellations (no nodes)
Never re-add an aggregate/table page; never anchor one work to two objects.

## v7 — reading-page design system "Quiet Instrument" (build 68)
Hero self-title "Physicist · Independent researcher" removed (home + flat menu). The whole
content-page family shares ONE design language (multi-agent-designed + adjudicated):
  · ONE 8px spacing scale (--s0..--s9) — no ad-hoc gaps
  · ONE hairline weight (--hairline .10) on every divider/border/rule
  · gold = STRUCTURE (eyebrow+tick, rule, footer keys, card top-gradient) ·
    coral --accent = INTERACTION only (hover, the year value, .go, focus, ::selection)
  · --read #cbc4b6 reading-contrast prose tint (locked --body untouched)
  · markup-free masthead: gold tick above the meta line, the year <b> in coral
  · standfirst lede = .desc p:first-child:not(:last-child) (gated so a lone para stays body)
  · Newsreader optical sizing driven (opsz 40 display / 24 lede / 16 body); CJK gets its
    own looser leading + positive tracking, never italic, never negative kern
Source of truth: scripts/gen-works.py CSS block (item pages); the same tokens/rules are
propagated into products/*.html, music.html, journey.html, footprint.html.
