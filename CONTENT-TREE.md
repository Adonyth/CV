# 站点内容图谱 · The Content Atlas (build 29 起为准, 2026-07-02)

> **硬规矩**:全站除"完整履历 ↗"按钮外,任何按钮/星点/CTA 严禁跳转 cv.html。
> 个人网站的每一类内容都有**自己的独立页面**(footprint.html 模式:懒加载、暖黑、⟵ 星盘返回),
> 页面入口 = 天体中的**具体位置**上的按钮/星点。
> **原则**:场景位置表达"心性"(☉主外 / ☾主内 / ⊕行迹 / ◎时间),页面归属表达"类别"。

## 一、内容普查与分类(先分对类,再谈位置)

### A. 学术研究 · 论文与预印本(对外的公开主张)
| 内容 | 状态 |
|---|---|
| Ringdown Overtone Significance(引力波方法) | RASTI 在审 |
| A Universal Prior Selects No Preferred Factorization(locality no-go) | SciPost Phys. Core 在审 |
| Random Sequence Scintillation(基础物理) | FoP 投稿 |
| Calibrated Belief-State Probing in LLMs(预注册诚实阴性) | 预印本 |
| Formation Mechanism of Blazar Jets | CONF-CIAP 2023 |
| MAXI J1348-630 Outburst(本科论文) | 已完成 |

### B. 研究课题 · 研究纲领与经历(进行中的火)
| 内容 | 性质 |
|---|---|
| ACAEXPL — 证书纪律物理(score-agnostic 风险证书 + 预注册证伪) | 纲领 |
| Born+naturalness capstone | 课题(进行中) |
| tackyon — 快子相边界分类 | 课题 |
| DTC 时间晶体证书移植 | 课题 |
| Omytea — Grand Unified World Model(终极物理纲领) | 纲领(心性主内,类别属此) |
| Omytea Personal Future Console | 纲领的活演示 |

### C. 著作与政经写作(内心的文字)
| 内容 | 状态 |
|---|---|
| An Invitation After Abundance(~1,164 页专著) | publish-ready |
| Technological Monopoly Rent | SSRN |
| Stack Power: Frontier AI & Market Non-Correction | IO(CUP)在审 |
| Camera, Player, Engine(相机·棋手·引擎,认识论) | 成文 |

### D. 造物(内心锻成的器物)
| 内容 | 形态 |
|---|---|
| omytea-quantum-substrate | PyPI 包 |
| GolfCal-1k | 基准数据集 |
| 弐时仪 Nye Clock | 独立站(外链,允许) |
| 本站(活星盘) | 你正在其中 |

### E. 履历 · 求学与研究经历(时间中的路)
山东大学物理学学士 → Brown University ScM(物理) → 独立研究者;各段研究经历。

### F. 足迹(空间中的路)✓ 已建成
602,733 原始 GPS 点 → footprint.html。

## 二、场所分配(类别 → 天体位置 → 独立页面)

| 场所 | 心性 | 承载类别 | 入口形式 | 独立页面 |
|---|---|---|---|---|
| **太阳本体 ☉** | 主外之源(火炉) | B 研究纲领与课题 | hover 出 CTA「研究纲领 ↗」 | `research.html` |
| **摩羯座星** | 主外之言(太阳星座) | A 论文与预印本(一星一文) | hover 出题名,click 开对应锚点 | `papers.html#<id>` |
| **月亮本体 ☾** | 主内之器 | D 造物 | hover 出 CTA「造物 ↗」 | `works.html` |
| **狮子座星** | 主内之言(月亮星座) | C 著作与政经(一星一作) | hover 出题名,click 开对应锚点 | `writings.html#<id>` |
| **干支四柱环 ◎** | 时间本身 | E 履历时间轴 | hover 环/玉牌出 CTA「履历 ↗」 | `journey.html` |
| **地球 ⊕** | 空间之迹 | F 足迹 | hover 出 CTA「足迹地图 ↗」✓ | `footprint.html` ✓ |

星→页锚点映射(natal-sky.json 的 `page` 字段,页面建成后转正为 `href`):
- 摩羯(A 类):ringdown / localityNoGo / rss / beliefprobe / blazar / maxi → `papers.html#<id>`;acaexpl 星 → `research.html#acaexpl`
- 狮子(C 类):invitation / monopolyRent / stackPower / cpe → `writings.html#<id>`
- 狮子 Regulus:omytea → `research.html#omytea`(位置尊重心性,类别归纲领)
- 造物星(D 类):omyteaSub / golfcal / console → `works.html#<id>`

## 三、导览栏 = 本图谱的投影(侧向弹出,不推挤)

```
命盘        → 生辰四柱 · 星座全图
☉ 研究      → 太阳与摩羯(巡航) · [研究纲领 → research.html] · [论文与预印本 → papers.html]
☾ 写作      → 月亮与狮子(巡航) · [著作与政经 → writings.html]
造物        → [造物 → works.html] · 弐时仪 ↗(外链)
◎ 履历      → [求学与研究之路 → journey.html]
⊕ 足迹      → 足迹地图 ✓
完整履历 ↗  → cv.html(全站唯一 cv 入口)
```
方括号 = 页面建成后回填的叶;未建成前不上栏(不许挂空按钮)。

## 四、建造顺序(一步一步,每页独立设计)

1. `journey.html` 履历时间轴(内容最确定)
2. `papers.html` 论文(一文一节:题名/状态/摘要/主链接 arXiv/SSRN/期刊)
3. `research.html` 纲领与课题(ACAEXPL/Omytea/进行中课题)
4. `writings.html` 著作与政经(书占首屏)
5. `works.html` 造物
6. 每页建成 → natal-sky.json `page`→`href` 转正 → 导览栏回填叶 → 场景 CTA 接线

## 五、当前状态(build 29)

- 导览栏侧向弹出 ✓;太阳/月亮独显时干支环整体隐去 ✓
- 星点 click 暂不跳转(hover 有题名+辉光响应),等页面逐个建成
- cv.html 全站仅存两处入口:左上名片「完整履历 ↗」+ 降级页链接(同为 CV 按钮)
