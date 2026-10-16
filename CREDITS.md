# Image credits

The 3D "living orrery" on the home page uses the following third-party imagery.

## Planet & moon surface maps (`data/planet-*.jpg`, `data/earth-*.jpg`, `data/moon-map.jpg`, `data/saturn-ring.png`)

Solar System Scope textures — © [solarsystemscope.com](https://www.solarsystemscope.com/textures/), licensed **CC BY 4.0**.

## Deep-sky objects (`data/dso-*.jpg`)

These photographs are **not displayed as images**; each is sampled into a static 3-D
point-cloud "particle portrait" of the object, placed at its real right-ascension / declination.

| File | Object | Source / credit | License |
|------|--------|-----------------|---------|
| dso-pillars.jpg | Pillars of Creation (Eagle Nebula, M16) | NASA, ESA, CSA, STScI — JWST NIRCam | Public Domain |
| dso-orion.jpg | Orion Nebula (M42) | NASA, ESA, M. Robberto (STScI/ESA) & the HST Orion Treasury Project Team | Public Domain |
| dso-rosette.jpg | Rosette Nebula (NGC 2237) | NOAO / AURA / NSF | Public Domain |
| dso-andromeda.jpg | Andromeda Galaxy (M31) | Adam Evans (M31 with h-alpha mosaic) | **CC BY 2.0** |
| dso-crab.jpg | Crab Nebula (M1) | NASA, ESA, J. Hester & A. Loll (Arizona State University) | Public Domain |
| dso-horsehead.jpg | Horsehead Nebula (Barnard 33) | ESA/Webb, NASA & CSA, K. Misselt (Univ. Arizona) & A. Abergel (IAS/Paris-Saclay, CNRS) — JWST NIRCam | **CC BY 4.0** |
| dso-lagoon.jpg | Lagoon Nebula (M8) | N. A. Sharp, REU program / NOIRLab / NSF / AURA (Kitt Peak) | **CC BY 4.0** |
| dso-ring.jpg | Ring Nebula (M57) | NASA, ESA & the Hubble Heritage Team (AURA/STScI) | Public Domain |
| dso-pleiades.jpg | Pleiades (M45) | NASA, ESA, AURA / Caltech, Palomar Observatory | Public Domain |
| dso-carina.jpg | Carina Nebula (NGC 3372) | NASA, ESA, N. Smith (UC Berkeley) & NOAO / AURA / NSF | Public Domain |
| dso-helix.jpg | Helix Nebula (NGC 7293) | NASA, NOAO, ESA & the Hubble Helix Nebula Team, M. Meixner (STScI) | Public Domain |

The **CC BY** works (Andromeda — Adam Evans; Horsehead — ESA/Webb et al.; Lagoon — NOIRLab/N. A. Sharp) are used with attribution as above.

The Milky Way itself is **not** an image — the solar system sits inside it, so it is rendered as a large procedural band of warm point-stars laid along the galactic plane (brighter toward the galactic centre in Sagittarius), generated at runtime with no source photograph.

## Base-view streets, buildings and streetlights (build 229)
The ground around the base view is generated live for wherever the visitor stands from
**OpenStreetMap** data (© OpenStreetMap contributors, licensed under the Open Database License — https://www.openstreetmap.org/copyright),
served as vector tiles in the **OpenMapTiles** schema (© OpenMapTiles) by **OpenFreeMap** (https://openfreemap.org).
Tiles are fetched through this site's own edge function; streetlight positions are derived from the road geometry.

## The real sky and the real Moon (build 230)
- **Stars:** the *Yale Bright Star Catalogue*, 5th revised edition (D. Hoffleit & W. H. Warren Jr., 1991), via the
  Harvard–Smithsonian Center for Astrophysics (http://tdc-www.harvard.edu/catalogs/bsc5.html) — repacked as
  `data/stars-bsc5.bin` (RA, Dec, magnitude, spectral class of 9,096 stars).
- **Lunar relief:** LRO Lunar Orbiter Laser Altimeter gridded topography `LDEM_16` (NASA / GSFC / MIT LOLA team),
  via the NASA PDS Geosciences Node — converted to the normal map `data/moon-normal-2k.jpg`. NASA data, public domain.
- **Lunar detail:** LROC Wide Angle Camera global mosaic `WAC_GLOBAL_E000N0000_008P` (NASA / GSFC / Arizona State
  University), used only for the finest crater detail in `data/moon-albedo-2k.jpg` (colour from `data/moon-map.jpg`,
  credited above). NASA data, public domain.

## Earth clouds, water mask and relief (build 237)
`data/earth-clouds-2k.jpg`, `data/earth-ocean-2k.jpg` and `data/earth-normal-2k.jpg` are converted from the
`earth_clouds_2048.png`, `earth_specular_2048.jpg` and `earth_normal_2048.jpg` textures shipped with the three.js
examples (r160, https://github.com/mrdoob/three.js — MIT licence), which derive from NASA's Blue Marble imagery
(NASA Earth Observatory, public domain).

## True-scale Solar System (build 241)
Positions are computed in the page, not shipped as data. Planets: E. M. Standish, "Keplerian Elements for
Approximate Positions of the Major Planets" (JPL Solar System Dynamics), Table 1. Moon: J. Meeus, *Astronomical
Algorithms* (2nd ed.), ch. 47, principal periodic terms. Planetary spin axes: the IAU Working Group on
Cartographic Coordinates and Rotational Elements report (Archinal et al., *Celestial Mechanics and Dynamical
Astronomy* 130:22, 2018). Body radii: the same report and NASA planetary fact sheets.

## Stars at their true distances (build 242)
`data/stars-hyg.bin` and `data/stars-hyg-names.json` are derived from the **HYG Stellar Database v4.0**
(David Nash / astronexus, https://github.com/astronexus/HYG-Database), licensed **CC BY-SA 4.0**
(https://creativecommons.org/licenses/by-sa/4.0/). Changes: kept every star brighter than magnitude 7.0 plus every
star within 25 pc (17,753 stars), stored as equatorial J2000 positions in parsecs, absolute magnitude and B−V colour,
plus the proper names of the brightest and nearest. These two derived files are shared under the same CC BY-SA 4.0
licence.

## The galaxies (build 246)
`data/galaxies2_*.i16` / `.u8` (built by `scripts/build-galaxies.py`) hold 76,241 real galaxies, combined from:
- **2M++** — G. Lavaux & M. J. Hudson, *MNRAS* 416, 2840 (2011), VizieR J/MNRAS/416/2840: positions, redshifts and
  group membership. Its zone-of-avoidance fill-in galaxies and cloned redshifts are left out.
- **The 2MASS Redshift Survey** — J. P. Huchra et al., *ApJS* 199, 26 (2012), VizieR J/ApJS/199/26: morphological
  types, and the galaxies 2M++ does not list.
- **The 2MASS Extended Source Catalog** — T. H. Jarrett et al., *AJ* 119, 2498 (2000), VizieR VII/233: sizes, axis
  ratios and position angles. This publication makes use of data products from the Two Micron All Sky Survey, which is
  a joint project of the University of Massachusetts and the Infrared Processing and Analysis Center/California
  Institute of Technology, funded by the National Aeronautics and Space Administration and the National Science
  Foundation.
- **The Updated Nearby Galaxy Catalog** — I. D. Karachentsev, D. I. Makarov & E. I. Kaisina, *AJ* 145, 101 (2013),
  VizieR J/AJ/145/101: measured (redshift-independent) distances, diameters, inclinations and types within ~11 Mpc.
- **The Extended Virgo Cluster Catalog** — S. Kim et al., *ApJS* 215, 22 (2014), VizieR J/ApJS/215/22: Virgo members
  and their morphologies.
- Cluster distances: Virgo 16.5 Mpc (S. Mei et al., *ApJ* 655, 144, 2007), Fornax 20.0 Mpc (J. P. Blakeslee et al.,
  *ApJ* 694, 556, 2009).

All retrieved through the VizieR catalogue service, CDS, Strasbourg (F. Ochsenbein, P. Bauer & J. Marcout, *A&AS* 143,
23, 2000). Method: elsewhere distances are heliocentric redshift ÷ H₀ (70 km s⁻¹ Mpc⁻¹), with each group's
fingers-of-God compressed to its own transverse extent; each galaxy's appearance is procedural, driven by its
catalogued type, size, axis ratio and sky position angle (untyped galaxies follow the morphology–density relation).

